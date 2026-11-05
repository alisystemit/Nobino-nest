/**
 * ارسال کمپین (متن مشترک بین endpoint «اجرای کمپین»، «پیش‌نمایش مخاطب» و کران).
 *
 * - مخاطب از `lib/marketing/segments` می‌آید: نوبت‌های تکمیل‌شده + بخش‌بندی
 *   (preset و معیارهای دستی روی `Campaign.filters`). پیش‌نمایش و ارسال همان تابع
 *   را صدا می‌زنند تا عددی که سالن می‌بیند با تعداد پیامک واقعی یکی بماند.
 * - سقف پیامک ماهانهٔ پلن رعایت می‌شود و تعداد مسدودشده‌ها برگردانده می‌شود.
 * - `uniqueKey` باعث می‌شود یک کمپین هرگز دوبار برای یک شماره ارسال نشود.
 */
import { prisma } from "@/lib/prisma";
import { enqueueSms } from "@/lib/notifications/queue";
import { resolveCampaignAudience } from "@/lib/marketing/segments";
import { PLAN_LABELS, checkLimit } from "@/lib/plans/limits";

export type CampaignSendResult = {
  sent: number;
  blocked: number;
  recipients: number;
  /** کل مخاطبان منطبق با بخش‌بندی، پیش از برش 500 نفره */
  matched: number;
  warning?: string;
  error?: string;
};

/** اجرای ارسال یک کمپین (SMS). برای EMAIL در این نسخه پشتیبانی نمی‌شود. */
export async function sendCampaignById(campaignId: string): Promise<CampaignSendResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { sent: 0, blocked: 0, recipients: 0, matched: 0, error: "campaign not found" };
  if (campaign.channel === "EMAIL") {
    return { sent: 0, blocked: 0, recipients: 0, matched: 0, error: "email campaign is not enabled in this build" };
  }

  const salonId = campaign.salonId;
  const smsCap = await checkLimit({ salonId }, "smsPerMonth");
  if (!smsCap.allowed) {
    return { sent: 0, blocked: 0, recipients: 0, matched: 0, error: smsCap.message };
  }

  // جایگزینی {salon} با نام سالن در قالب‌های آماده
  const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { name: true } });
  const message = salon ? campaign.message.replaceAll("{salon}", salon.name) : campaign.message;

  const audience = await resolveCampaignAudience(salonId, campaign.segment, campaign.filters);
  const recipients = audience.recipients;

  // تا جایی که سهمیهٔ پیامک ماهانه اجازه می‌دهد ارسال می‌کنیم
  const remaining = typeof smsCap.limit === "number" ? Math.max(0, smsCap.limit - smsCap.used) : recipients.length;
  const targets = recipients.slice(0, remaining);

  let sent = 0;
  for (const phone of targets) {
    const r = await enqueueSms({
      type: "MARKETING",
      recipient: phone,
      message,
      uniqueKey: `campaign:${campaign.id}:${phone}`,
      salonId,
    });
    if (r.queued) sent++;
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "SENT", sentAt: new Date(), sentCount: sent },
  });

  const blocked = recipients.length - sent;
  const notes: string[] = [];
  if (blocked > 0) notes.push(`${blocked} مخاطب به دلیل سقف «${smsCap.def.label}» پلن ${PLAN_LABELS[smsCap.plan]} ارسال نشد.`);
  if (audience.invalid > 0) notes.push(`${audience.invalid} شمارهٔ ثبت‌شده قابل ارسال نیست.`);
  if (audience.truncated) notes.push("شمارش نوبت‌ها به سقف رسید؛ بخشی از مخاطب شمرده نشد.");

  return {
    sent,
    blocked,
    recipients: recipients.length,
    matched: audience.total,
    warning: notes.length ? notes.join(" ") : undefined,
  };
}

/**
 * کمپین‌هایی که زمان‌شان رسیده (SCHEDULED و scheduledAt <= now) را ارسال می‌کند.
 * از کران `cron/reminders` (هر ساعت) صدا زده می‌شود.
 */
export async function sendDueScheduledCampaigns(now = new Date(), batchSize = 10) {
  const due = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now, not: null } },
    orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
    take: batchSize,
  });
  const results: { campaignId: string; sent: number; blocked: number; error?: string }[] = [];
  for (const c of due) {
    const r = await sendCampaignById(c.id);
    results.push({ campaignId: c.id, sent: r.sent, blocked: r.blocked, error: r.error });
  }
  return { due: due.length, results };
}
