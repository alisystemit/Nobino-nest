// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/campaigns/[campaignId]/run/route.ts
// منطق ارسال به `lib/notifications/campaign-send.ts` منتقل شده تا کرانِ کمپین‌های
// زمان‌بندی‌شده هم همان مسیر را برود (این فایل فقط guard + کد وضعیت می‌دهد).
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { sendCampaignById } from "@/lib/notifications/campaign-send";
import { json, apiError } from "@/lib/utils";

/** اجرای کمپین برای مشتریانی که مراجعهٔ واقعی داشته‌اند */
export async function POST(_req: Request, { params }: { params: { id: string; campaignId: string } | Promise<{ id: string; campaignId: string }> }) {
  try {
    const { id, campaignId } = await params;
    await requireSalonManage(id);

    // همان اعتبارسنجی قبلی: کمپین باید متعلق به همین سالن باشد
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { salonId: true } });
    if (!campaign || campaign.salonId !== id) return json({ success: false, error: "campaign not found" }, { status: 404 });

    const r = await sendCampaignById(campaignId);
    if (r.error) {
      const status = r.error === "email campaign is not enabled in this build" ? 400 : 402;
      return json({ success: false, error: r.error }, { status });
    }

    const updated = await prisma.campaign.findUnique({ where: { id: campaignId } });
    return json({
      success: true,
      campaign: updated,
      recipients: r.sent,
      blocked: r.blocked,
      warning: r.warning,
    });
  } catch (err) {
    return apiError(err);
  }
}
