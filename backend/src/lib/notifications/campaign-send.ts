/**
 * ارسال کمپین (متن مشترک بین endpoint «اجرای کمپین» و کران).
 *
 * - مخاطبان از نوبت‌های «تکمیل‌شده» همان سالن ساخته می‌شوند (بخش‌بندی ALL/RETURNING).
 * - سقف پیامک ماهانهٔ پلن رعایت می‌شود و تعداد مسدودشده‌ها برگردانده می‌شود.
 * - `uniqueKey` باعث می‌شود یک کمپین هرگز دوبار برای یک شماره ارسال نشود.
 */
import { prisma } from "@/lib/prisma";
import { enqueueSms } from "@/lib/notifications/queue";
import { PLAN_LABELS, checkLimit } from "@/lib/plans/limits";

export type CampaignSendResult = {
  sent: number;
  blocked: number;
  recipients: number;
  warning?: string;
  error?: string;
};

/** اجرای ارسال یک کمپین (SMS). برای EMAIL در این نسخه پشتیبانی نمی‌شود. */
export async function sendCampaignById(campaignId: string): Promise<CampaignSendResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { sent: 0, blocked: 0, recipients: 0, error: "campaign not found" };
  if (campaign.channel === "EMAIL") {
    return { sent: 0, blocked: 0, recipients: 0, error: "email campaign is not enabled in this build" };
  }

  const salonId = campaign.salonId;
  const smsCap = await checkLimit({ salonId }, "smsPerMonth");
  if (!smsCap.allowed) {
    return { sent: 0, blocked: 0, recipients: 0, error: smsCap.message };
  }

  // جایگزینی {salon} با نام سالن در قالب‌های آماده
  const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { name: true } });
  const message = salon ? campaign.message.replaceAll("{salon}", salon.name) : campaign.message;

  const appointments = await prisma.appointment.findMany({
    where: { salonId, status: "COMPLETED" },
    select: { customerPhone: true },
    take: 2000,
  });

  const counts = new Map<string, number>();
  for (const a of appointments) counts.set(a.customerPhone, (counts.get(a.customerPhone) ?? 0) + 1);

  const recipients = [...counts.entries()]
    .filter(([, count]) => (campaign.segment === "RETURNING" ? count > 1 : count >= 1))
    .map(([phone]) => phone)
    .filter((phone) => /^0?9\d{9}$/.test(phone))
    .slice(0, 500);

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
  return {
    sent,
    blocked,
    recipients: recipients.length,
    warning:
      blocked > 0
        ? `${blocked} مخاطب به دلیل سقف «${smsCap.def.label}» پلن ${PLAN_LABELS[smsCap.plan]} ارسال نشد.`
        : undefined,
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
