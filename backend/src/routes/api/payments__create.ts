// خودکار: پورت‌شده از src/app/api/payments/create/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { createPaymentForOrder, createDepositPayment, finalizePaidOrder } from "@/lib/payments/engine";
import { asNumber } from "@/lib/money";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  packageId: z.string().optional(),
  // برای پرداخت بیعانهٔ نوبت، شناسهٔ نوبت به‌جای پکیج می‌آید
  appointmentId: z.string().optional(),
  salonId: z.string().optional(),
  gateway: z.string().optional(),
  discountCode: z.string().optional(),
  period: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
  autoRenew: z.boolean().default(false),
});

/** پرداخت بیعانهٔ نوبت — فقط صاحب نوبت (با حساب یا همان شمارهٔ تلفن) */
async function depositFlow(user: { id: string; role: string; phone?: string | null }, appointmentId: string, gateway?: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { salon: { select: { name: true } } },
  });
  if (!appointment) return json({ success: false, error: "نوبت یافت نشد" }, { status: 404 });

  const isOwner =
    appointment.customerId === user.id ||
    (user.phone != null && appointment.customerPhone === user.phone);
  if (user.role !== "ADMIN" && !isOwner) {
    return json({ success: false, error: "این نوبت متعلق به شما نیست" }, { status: 403 });
  }
  if (appointment.depositPaid) {
    return json({ success: false, error: "بیعانهٔ این نوبت قبلاً پرداخت شده است" }, { status: 400 });
  }
  if (!appointment.depositAmount || appointment.depositAmount <= 0) {
    return json({ success: false, error: "برای این نوبت بیعانه تعریف نشده است" }, { status: 400 });
  }

  const { payment } = await createDepositPayment({ appointmentId: appointment.id, gateway });

  return json(
    {
      success: true,
      appointmentId: appointment.id,
      paymentId: payment.id,
      gateway: payment.gateway,
      redirectUrl: payment.redirectUrl,
      amount: appointment.depositAmount,
      salonName: appointment.salon?.name ?? null,
    },
    { status: 201 }
  );
}

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = schema.parse(await req.json());

    // شاخهٔ بیعانه: با شناسهٔ نوبت، پکیج لازم نیست
    if (body.appointmentId) {
      return depositFlow(user, body.appointmentId, body.gateway);
    }

    if (!body.packageId) {
      return json({ success: false, error: "شناسهٔ پکیج لازم است" }, { status: 400 });
    }
    const pkg = await prisma.package.findUnique({ where: { id: body.packageId } });
    if (!pkg || !pkg.isActive) return json({ success: false, error: "پکیج یافت نشد" }, { status: 404 });

    // اعتبارسنجی مالکیت سالن: کاربر فقط می‌تواند برای سالن خودش اشتراک بخرد
    let salonId = body.salonId;
    if (salonId) {
      const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { ownerId: true } });
      if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
      if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
        return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
      }
    } else if (user.role !== "ADMIN") {
      const owned = await prisma.salon.findFirst({
        where: { ownerId: user.id },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (owned) salonId = owned.id;
    }

    // قیمت بر اساس دوره: سالانه = price*10 (یا yearlyPrice اگر تنظیم شده باشد)
    const monthlyPrice = asNumber(pkg.price);
    const unitPrice = body.period === "YEARLY"
      ? (pkg.yearlyPrice != null ? asNumber(pkg.yearlyPrice) : monthlyPrice * 10)
      : monthlyPrice;

    let amount = unitPrice;
    let originalAmount = unitPrice;
    let discountId: string | undefined;

    // اعمال کد تخفیف — کد ابتدا trim می‌شود تا «فاصله» به‌جای کد خالی ننشیند
    const discountCode = body.discountCode?.trim().toUpperCase() ?? "";
    if (discountCode) {
      const discount = await prisma.discount.findUnique({ where: { code: discountCode } });
      if (!discount || !discount.isActive) {
        return json({ success: false, error: "کد تخفیف نامعتبر است" }, { status: 400 });
      }
      if (discount.expiresAt && discount.expiresAt < new Date()) {
        return json({ success: false, error: "کد تخفیف منقضی شده است" }, { status: 400 });
      }
      if (discount.maxUses > 0 && discount.usedCount >= discount.maxUses) {
        return json({ success: false, error: "کد تخفیف استفاده شده است" }, { status: 400 });
      }
      const discountAmount = Math.round((unitPrice * discount.percent) / 100);
      amount = Math.max(0, unitPrice - discountAmount);
      discountId = discount.id;
      // مبلغ پیش از تخفیف هم باید دورهٔ انتخاب‌شده را رعایت کند (نه فقط قیمت ماهانه)
      originalAmount = unitPrice;
      // شمارندهٔ استفاده فقط در callback موفق و داخل همان تراکنش افزایش می‌یابد
      // (lib/payments/engine.ts) — اینجا عملاً چیزی نوشته نمی‌شود تا پرداخت
      // ناموفق سهمیهٔ کد را نسوزاند.
    }

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        salonId,
        packageId: pkg.id,
        discountId,
        amount,
        originalAmount,
        period: body.period,
        autoRenew: body.autoRenew,
        status: "PENDING",
      },
    });

    // سفارش رایگان (پلن رایگان یا تخفیف ۱۰۰٪): بدون درگاه و بدون Payment
    // مستقیم نهایی می‌شود تا مسیر «پرداخت جعلی» برای مبلغ صفر وجود نداشته باشد.
    // ثبت PAID، افزایش سهمیهٔ تخفیف و فعال‌سازی اشتراک/فاکتور/کمیسیون اتمیک است.
    if (amount <= 0) {
      const finalized = await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
        if (discountId) {
          await tx.discount.update({ where: { id: discountId }, data: { usedCount: { increment: 1 } } });
        }
        return finalizePaidOrder(order, tx);
      }, { timeout: 15_000 });
      if (finalized.subscription) {
        const { notifyActivatedSubscription } = await import("@/lib/subscriptions");
        await notifyActivatedSubscription(finalized.subscription).catch(() => {});
      }
      return json(
        {
          success: true,
          free: true,
          orderId: order.id,
          amount: 0,
          originalAmount,
          discountApplied: discountId ? true : false,
        },
        { status: 201 }
      );
    }

    const { payment, gateway } = await createPaymentForOrder({ orderId: order.id, gateway: body.gateway });

    return json(
      {
        success: true,
        orderId: order.id,
        paymentId: payment.id,
        gateway,
        redirectUrl: payment.redirectUrl,
        amount,
        originalAmount,
        discountApplied: discountId ? true : false,
      },
      { status: 201 }
    );
  } catch (err) {
    return apiError(err);
  }
}

