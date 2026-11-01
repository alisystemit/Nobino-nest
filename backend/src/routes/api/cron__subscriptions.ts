// خودکار: پورت‌شده از src/app/api/cron/subscriptions/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { requireCronAuth } from "@/lib/auth/cron-guard";
import { chargeRenewal } from "@/lib/billing";
import { enqueueSms, processPendingNotifications } from "@/lib/notifications/queue";
import { json } from "@/lib/utils";

/**
 * Cron اشتراک (روزانه):
 * - تمدید خودکار اشتراک‌های در شرف پایان که autoRenew دارند.
 * - منقضی کردن اشتراک‌های تمام‌شده بدون تمدید و اطلاع‌رسانی.
 * - یادآوری پایان دوره پیش از انقضا.
 */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const now = new Date();
  const soon = new Date(Date.now() + 3 * 864e5); // ۳ روز بعد

  const due = await prisma.subscription.findMany({
    where: { status: "ACTIVE", endsAt: { lte: soon } },
    include: { salon: true, package: true },
  });

  let renewed = 0;
  let expired = 0;
  let reminded = 0;
  let failedRenewals = 0;

  for (const sub of due) {
    if (sub.endsAt <= now) {
      if (sub.autoRenew) {
        const charge = await chargeRenewal(sub.id);
        if (charge.success) {
          renewed++;
        } else {
          failedRenewals++;
          await enqueueSms({
            type: "SUBSCRIPTION_PAYMENT_FAILED",
            recipient: sub.salon.phone,
            message: `پرداخت تمدید اشتراک «${sub.package.name}» ناموفق بود. برای ادامه، لطفاً پرداخت را تکرار کنید.`,
            uniqueKey: `subfailed:${sub.id}:${charge.orderId ?? ""}`,
            salonId: sub.salonId,
          });
        }
      } else {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
        await prisma.salon.update({ where: { id: sub.salonId }, data: { plan: "FREE", subscriptionEndsAt: null } });
        await enqueueSms({
          type: "SUBSCRIPTION_EXPIRED",
          recipient: sub.salon.phone,
          message: `اشتراک «${sub.package.name}» برای «${sub.salon.name}» منقضی شد. برای ادامه، تمدید کنید.`,
          uniqueKey: `subexpired:${sub.id}`,
          salonId: sub.salonId,
        });
        expired++;
      }
    } else {
      await enqueueSms({
        type: "SUBSCRIPTION_RENEWAL_REMINDER",
        recipient: sub.salon.phone,
        message: `اشتراک «${sub.package.name}» برای «${sub.salon.name}» تا ${sub.endsAt.toLocaleDateString("fa-IR")} اعتبار دارد.`,
        uniqueKey: `subremind:${sub.id}`,
        salonId: sub.salonId,
      });
      reminded++;
    }
  }

  const result = await processPendingNotifications(30);

  return json({ success: true, scanned: due.length, renewed, failedRenewals, expired, reminded, ...result });
}
