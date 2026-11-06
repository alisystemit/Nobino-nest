import { prisma } from "@/lib/prisma";
import { env, isSandbox } from "@/lib/env";
import { createPaymentForOrder, handlePaymentCallback } from "@/lib/payments/engine";
import { generateInvoiceForOrder } from "@/lib/invoices";
import { renewSubscription } from "@/lib/subscriptions";
import { assertPositiveMoney, asNumber } from "@/lib/money";

/**
 * تلاش برای تمدید اشتراک با پرداخت واقعی:
 * - ساخت Order (با `renewalSubscriptionId`) و Invoice
 * - ساخت درخواست پرداخت
 * - در حالت sandbox، تأیید/تسویه خودکار
 * - در حالت واقعی، لینک پرداخت برای بازگشت به کاربر برنامه برگشت می‌دهد
 *
 * نکتهٔ مهم: تمدید **فقط داخل callback پرداخت** انجام می‌شود (تراکنشی، همراه
 * با PAID شدن سفارش). قبلاً اینجا بعد از callback دوباره `renewSubscription`
 * صدا زده می‌شد و علاوه بر آن `finalizePaidOrder` هم اشتراک جدید می‌ساخت؛
 * نتیجه دو رکورد ACTIVE و تمدید دوباره بود.
 */
export async function chargeRenewal(subscriptionId: string): Promise<{
  success: boolean;
  /** پرداخت در انتظار کاربر است (درگاه واقعی) — خطا نیست */
  pending?: boolean;
  orderId?: string;
  redirectUrl?: string;
  message?: string;
}> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { package: true, salon: { select: { id: true, ownerId: true, name: true, phone: true } } },
  });
  if (!sub) return { success: false, message: "subscription not found" };
  if (sub.status !== "ACTIVE") return { success: false, message: "subscription not active" };

  const amount = asNumber(sub.period === "YEARLY" ? sub.package.yearlyPrice ?? sub.package.price : sub.package.price);

  // پلن رایگان: درگاهی برای پرداخت صفر وجود ندارد؛ مستقیم و تراکنشی تمدید کن.
  if (amount <= 0) {
    const renewed = await renewSubscription(subscriptionId);
    return renewed ? { success: true } : { success: false, message: "renewal failed" };
  }
  assertPositiveMoney(amount, "مبلغ تمدید");

  const order = await prisma.order.create({
    data: {
      userId: sub.salon.ownerId,
      salonId: sub.salonId,
      packageId: sub.packageId,
      amount,
      originalAmount: amount,
      period: sub.period,
      autoRenew: sub.autoRenew,
      status: "PENDING",
      // به callback می‌گوید این سفارش «تمدید» است، نه خرید/فعال‌سازی جدید
      renewalSubscriptionId: subscriptionId,
    },
  });

  await generateInvoiceForOrder(order.id, sub.id);

  try {
    const { payment, gateway } = await createPaymentForOrder({ orderId: order.id, gateway: env.PAYMENT_DEFAULT_GATEWAY });

    if (gateway === "sandbox" || isSandbox(env.PAYMENT_SANDBOX)) {
      await handlePaymentCallback({
        gatewayId: gateway,
        orderId: order.id,
        authority: payment.authority ?? undefined,
        searchParams: { Status: "OK" },
      });
      const paid = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
      if (paid?.status === "PAID") {
        // تمدید داخل همان تراکنش callback انجام شده است؛ اینجا تکرار نکن.
        return { success: true, orderId: order.id };
      }
      return { success: false, orderId: order.id, message: "renewal payment failed" };
    }

    return { success: false, pending: true, orderId: order.id, redirectUrl: payment.redirectUrl, message: "awaiting payment" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "renewal payment error";
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } }).catch(() => {});
    return { success: false, orderId: order.id, message };
  }
}
