// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/campaigns/[campaignId]/run/route.ts — بدون تغییر منطق
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { enqueueSms } from "@/lib/notifications/queue";
import { PLAN_LABELS, checkLimit } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";

/** اجرای کمپین برای مشتریانی که مراجعهٔ واقعی داشته‌اند */
export async function POST(_req: Request, { params }: { params: { id: string; campaignId: string } | Promise<{ id: string; campaignId: string }> }) {
  try {
    const { id, campaignId } = await params;
    await requireSalonManage(id);
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.salonId !== id) return json({ success: false, error: "campaign not found" }, { status: 404 });

    // سقف پیامک ماهانهٔ پلن: قبل از گرفتن مخاطبان بررسی شود تا پیام روشن بدهیم
    const smsCap = await checkLimit({ salonId: id }, "smsPerMonth");
    if (!smsCap.allowed) return json({ success: false, error: smsCap.message }, { status: 402 });

    // جایگزینی {salon} با نام سالن در قالب‌های آماده
    const salon = await prisma.salon.findUnique({ where: { id }, select: { name: true } });
    const message = salon ? campaign.message.replaceAll("{salon}", salon.name) : campaign.message;

    const appointments = await prisma.appointment.findMany({
      where: { salonId: id, status: "COMPLETED" },
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

    if (campaign.channel === "EMAIL") {
      return json({ success: false, error: "email campaign is not enabled in this build" }, { status: 400 });
    }

    // تا جایی که سهمیهٔ پیامک ماهانه اجازه می‌دهد ارسال می‌کنیم
    const remaining = typeof smsCap.limit === "number" ? Math.max(0, smsCap.limit - smsCap.used) : recipients.length;
    const targets = recipients.slice(0, remaining);

    let queued = 0;
    for (const phone of targets) {
      const r = await enqueueSms({
        type: "MARKETING",
        recipient: phone,
        message,
        uniqueKey: `campaign:${campaign.id}:${phone}`,
        salonId: id,
      });
      if (r.queued) queued++;
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "SENT", sentAt: new Date(), sentCount: queued },
    });

    const blocked = recipients.length - queued;
    return json({
      success: true,
      campaign: updated,
      recipients: queued,
      blocked,
      warning:
        blocked > 0
          ? `${blocked} مخاطب به دلیل سقف «${smsCap.def.label}» پلن ${PLAN_LABELS[smsCap.plan]} ارسال نشد.`
          : undefined,
    });
  } catch (err) {
    return apiError(err);
  }
}