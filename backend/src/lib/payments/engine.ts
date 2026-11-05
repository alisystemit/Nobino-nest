import { prisma } from "@/lib/prisma";
import { generateInvoiceForOrder } from "@/lib/invoices";
import { getGateway } from "@/lib/payments/registry";
import type { PaymentGateway, PaymentOrder } from "@/lib/payments/types";
import { sandboxModeAllowed } from "@/lib/payments/gateway-config";
import { env } from "@/lib/env";
import { settingOrEnv } from "@/lib/settings";
import { httpError } from "@/lib/utils";

/**
 * موتور پرداخت - هماهنگ‌کننده همه درگاه‌ها.
 * مراحل: ساخت Order و Payment → دریافت لینک درگاه → بازگشت → Verify → به‌روزرسانی.
 */

/**
 * درگاه «sandbox» و مسیرهای شبیه‌سازی فقط ابزار توسعه‌اند؛ بیرون از محیط
 * توسعهٔ صریح (یا بدون سوئیچ آگاهانهٔ سوپرادمین) هرگز نباید تراکنش واقعی
 * را «تأیید» کنند. قبلاً معیار NODE_ENV === "production" بود که در
 * استقرارهای بدون NODE_ENV هیچ‌وقت فعال نمی‌شد.
 */
async function assertGatewayUsable(gwId: string) {
  if (gwId === "sandbox" && !(await sandboxModeAllowed())) {
    throw httpError("درگاه شبیه‌سازی در این محیط در دسترس نیست.", 400);
  }
}

/**
 * درگاه پیش‌فرض: تنظیم پویای `payments.default_gateway` از پنل سوپرادمین،
 * و در نبود آن متغیر محیطی `PAYMENT_DEFAULT_GATEWAY`.
 */
async function defaultGatewayId(): Promise<string> {
  const value = ((await settingOrEnv("payments.default_gateway", env.PAYMENT_DEFAULT_GATEWAY)) ?? "sandbox").trim();
  return value || "sandbox";
}

export async function createPaymentForOrder(params: {
  orderId: string;
  gateway?: string;
}): Promise<{ payment: { id: string; gateway: string; authority?: string | null; redirectUrl?: string }; gateway: string }> {
  const gwId = params.gateway ?? (await defaultGatewayId());
  await assertGatewayUsable(gwId);
  const gateway = getGateway(gwId);

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { package: true, user: true },
  });
  if (!order) throw httpError("سفارش یافت نشد", 404);
  if (order.status === "PAID") throw httpError("سفارش قبلاً پرداخت شده است", 400);

  const callbackUrl = `${env.PAYMENT_CALLBACK_BASE}/${gwId}?order=${order.id}`;

  // لغو پرداخت‌های قبلی pending برای این سفارش
  await prisma.payment.updateMany({
    where: { orderId: order.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      gateway: gwId,
      amount: order.amount,
      status: "PENDING",
      callbackUrl,
    },
  });

  const paymentOrder: PaymentOrder = {
    id: order.id,
    amount: order.amount,
    description: `خرید پکیج ${order.package?.name ?? ""} - سفارش ${order.id}`,
    callbackUrl,
    customer: { phone: order.user?.phone, name: order.user?.name ?? undefined },
  };

  const result = await gateway.requestPayment(paymentOrder);

  await prisma.payment.update({
    where: { id: payment.id },
    data: { authority: result.authority ?? null, payload: { request: result.raw } as never },
  });

  if (!result.success) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    throw new Error(result.message ?? "خطا در ایجاد درخواست پرداخت");
  }

  return {
    payment: { id: payment.id, gateway: gwId, authority: result.authority, redirectUrl: result.redirectUrl },
    gateway: gwId,
  };
}

/**
 * ایجاد درخواست پرداخت برای یک فاکتور خدماتی (بدون نیاز به لاگین مشتری).
 */
export async function createPaymentForInvoice(params: {
  invoiceId: string;
  gateway?: string;
}): Promise<{ payment: { id: string; gateway: string; authority?: string | null; redirectUrl?: string }; gateway: string }> {
  const gwId = params.gateway ?? (await defaultGatewayId());
  await assertGatewayUsable(gwId);
  const gateway = getGateway(gwId);

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { salon: { select: { name: true } } },
  });
  if (!invoice) throw httpError("فاکتور یافت نشد", 404);
  if (invoice.status === "PAID") throw httpError("فاکتور قبلاً پرداخت شده است", 400);

  const callbackUrl = `${env.PAYMENT_CALLBACK_BASE}/${gwId}?invoice=${invoice.id}`;

  // لغو پرداخت‌های قبلی pending برای این فاکتور
  await prisma.payment.updateMany({
    where: { invoiceId: invoice.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  const payment = await prisma.payment.create({
    data: {
      invoiceId: invoice.id,
      gateway: gwId,
      amount: invoice.amount,
      status: "PENDING",
      callbackUrl,
    },
  });

  const paymentOrder: PaymentOrder = {
    id: invoice.id,
    amount: invoice.amount,
    description: `پرداخت فاکتور ${invoice.number} - ${invoice.salon?.name ?? ""}`,
    callbackUrl,
    invoiceId: invoice.id,
    customer: { phone: invoice.customerPhone ?? undefined, name: invoice.customerName ?? undefined },
  };

  const result = await gateway.requestPayment(paymentOrder);

  await prisma.payment.update({
    where: { id: payment.id },
    data: { authority: result.authority ?? null, payload: { request: result.raw } as never },
  });

  if (!result.success) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    throw new Error(result.message ?? "خطا در ایجاد درخواست پرداخت");
  }

  return {
    payment: { id: payment.id, gateway: gwId, authority: result.authority, redirectUrl: result.redirectUrl },
    gateway: gwId,
  };
}

/**
 * ایجاد درخواست پرداخت بیعانهٔ نوبت (پیش‌پرداخت رزرو مشتری).
 * مبلغ از تنظیمات سالن در زمان ثبت نوبت روی خود نوبت ذخیره شده است.
 */
export async function createDepositPayment(params: {
  appointmentId: string;
  gateway?: string;
}): Promise<{ payment: { id: string; gateway: string; authority?: string | null; redirectUrl?: string }; gateway: string }> {
  const gwId = params.gateway ?? (await defaultGatewayId());
  await assertGatewayUsable(gwId);
  const gateway = getGateway(gwId);

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    include: { salon: { select: { name: true } } },
  });
  if (!appointment) throw httpError("نوبت یافت نشد", 404);
  if (appointment.depositPaid) throw httpError("بیعانهٔ این نوبت قبلاً پرداخت شده است", 400);
  const amount = appointment.depositAmount ?? 0;
  if (amount <= 0) throw httpError("برای این نوبت بیعانه تعریف نشده است", 400);

  const callbackUrl = `${env.PAYMENT_CALLBACK_BASE}/${gwId}?appointment=${appointment.id}&redirect=/mini`;

  // لغو پرداخت‌های قبلی pending برای این نوبت
  await prisma.payment.updateMany({
    where: { appointmentId: appointment.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  const payment = await prisma.payment.create({
    data: {
      appointmentId: appointment.id,
      gateway: gwId,
      amount,
      status: "PENDING",
      callbackUrl,
    },
  });

  const paymentOrder: PaymentOrder = {
    id: appointment.id,
    appointmentId: appointment.id,
    amount,
    description: `بیعانهٔ نوبت ${appointment.salon?.name ?? ""}`,
    callbackUrl,
    redirectPath: "/mini",
    customer: { phone: appointment.customerPhone, name: appointment.customerName },
  };

  const result = await gateway.requestPayment(paymentOrder);

  await prisma.payment.update({
    where: { id: payment.id },
    data: { authority: result.authority ?? null, payload: { request: result.raw } as never },
  });

  if (!result.success) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    throw new Error(result.message ?? "خطا در ایجاد درخواست پرداخت");
  }

  return {
    payment: { id: payment.id, gateway: gwId, authority: result.authority, redirectUrl: result.redirectUrl },
    gateway: gwId,
  };
}

/**
 * کارهای پس از پرداخت موفق سفارش: فعال‌سازی اشتراک، صدور فاکتور و کمیسیون
 * نمایندگان. بین پرداخت واقعی (callback درگاه) و سفارش رایگان (مبلغ صفر)
 * مشترک است تا هر دو مسیر دقیقاً یک رفتار داشته باشند.
 */
export async function finalizePaidOrder(order: {
  id: string;
  salonId: string | null;
  packageId: string;
  period: string;
  autoRenew: boolean;
  amount: number;
}) {
  if (order.salonId) {
    const { activateSubscription } = await import("@/lib/subscriptions");
    await activateSubscription({ salonId: order.salonId, packageId: order.packageId, period: order.period, autoRenew: order.autoRenew });
    const activeSubscription = await prisma.subscription.findFirst({
      where: { salonId: order.salonId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    await generateInvoiceForOrder(order.id, activeSubscription?.id ?? null).catch(() => {});

    // کمیسیون نمایندگان فعال سالن از مبلغ سفارش پرداخت‌شده
    const plans = await prisma.commissionPlan.findMany({
      where: { salonId: order.salonId, isActive: true },
      select: { agentId: true, percent: true },
    });
    for (const plan of plans) {
      if (plan.percent > 0) {
        const { applyCommissionOnAmount } = await import("@/lib/financial/commission");
        await applyCommissionOnAmount({
          agentId: plan.agentId,
          salonId: order.salonId,
          amount: order.amount,
        }).catch(() => {});
      }
    }
  }
}

/**
 * پردازش بازگشت (Callback) از درگاه.
 * پس از Verify موفق، وضعیت Order و Payment به PAID تغییر می‌کند.
 */
export async function handlePaymentCallback(params: {
  gatewayId: string;
  orderId?: string;
  invoiceId?: string;
  appointmentId?: string;
  authority?: string;
  searchParams: Record<string, string>;
}): Promise<{ success: boolean; companyId?: string; message?: string }> {
  if (params.appointmentId) {
    return handleDepositCallback(getGateway(params.gatewayId), params.appointmentId, params.authority, params.searchParams);
  }
  if (params.invoiceId) {
    return handleInvoiceCallback(getGateway(params.gatewayId), params.invoiceId, params.authority, params.searchParams);
  }
  const gateway = getGateway(params.gatewayId);
  const orderId = params.orderId ?? "";
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { package: true, user: true } });
  if (!order) return { success: false, message: "سفارش یافت نشد" };
  // محافظ idempotency: بازگشت تکراری درگاه نباید تخفیف/اشتراک/کمیسیون را دوباره اعمال کند
  if (order.status === "PAID") return { success: true, companyId: "ALREADY_PAID" };

  // فقط پرداخت PENDING همان درگاه قابل verify است؛ callback بدون پرداختِ
  // در انتظار معتبر نیست (جلوگیری از «پرداخت جعلی» با یک URL دست‌ساز).
  const payment = await prisma.payment.findFirst({
    where: { orderId: order.id, gateway: params.gatewayId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!payment) return { success: false, message: "پرداخت در انتظاری برای این سفارش ثبت نشده است" };
  // درگاه‌های شبیه‌سازی: شناسهٔ برگشتی باید با شناسهٔ ثبت‌شده یکی باشد
  if (gateway.sandbox && payment.authority && params.authority && payment.authority !== params.authority) {
    return { success: false, message: "شناسهٔ پرداخت معتبر نیست" };
  }

  const paymentOrder: PaymentOrder = {
    id: order.id,
    amount: order.amount,
    description: "پرداخت",
    callbackUrl: payment.callbackUrl ?? "",
  };

  const result = await gateway.verifyPayment({
    order: paymentOrder,
    authority: params.authority ?? payment.authority ?? undefined,
    params: params.searchParams,
  });

  if (result.success) {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", refId: result.refId, cardPan: result.cardPan, payload: { verified: result.raw } as never },
      }),
      // اگر تخفیف به‌کار رفته، شمارنده استفاده را یک واحد افزایش بده
      ...(order.discountId
        ? [prisma.discount.update({ where: { id: order.discountId }, data: { usedCount: { increment: 1 } } })]
        : []),
    ]);

    // فعال‌سازی اشتراک، فاکتور و کمیسیون نمایندگان (بین پرداخت عادی و سفارش رایگان مشترک است)
    await finalizePaidOrder(order);

    return { success: true, companyId: result.refId };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED", payload: { verifyFailed: result.raw } as never },
  });

  return { success: false, message: result.message ?? "پرداخت ناموفق" };
}

/** برای درگاه‌های sandbox، این مسیر پرداخت تست را شبیه‌سازی می‌کند */
export async function simulateSandboxPay(params: { orderId?: string; appointmentId?: string; authority?: string }) {
  const orderId = params.orderId ?? "";
  const appointmentId = params.appointmentId ?? "";
  if (!orderId && !appointmentId) return { success: false, message: "شناسه پرداخت نامعتبر" };
  if (orderId) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      // پرداخت فاکتور خدماتی (شناسه، شناسه فاکتور است)
      const invoice = await prisma.invoice.findUnique({ where: { id: orderId } });
      if (!invoice) return { success: false, message: "سفارش یافت نشد" };
      return { success: true, note: "پرداخت تست شبیه‌سازی‌شده", invoiceId: orderId };
    }
    return { success: true, note: "پرداخت تست شبیه‌سازی‌شده", orderId };
  }
  // پرداخت بیعانهٔ نوبت
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return { success: false, message: "نوبت یافت نشد" };
  return { success: true, note: "پرداخت تست شبیه‌سازی‌شده", appointmentId };
}

/** پردازش بازگشت درگاه برای بیعانهٔ نوبت */
async function handleDepositCallback(
  gateway: PaymentGateway,
  appointmentId: string,
  authority?: string,
  searchParams: Record<string, string> = {}
): Promise<{ success: boolean; companyId?: string; message?: string }> {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return { success: false, message: "نوبت یافت نشد" };
  // محافظ idempotency: بازگشت تکراری درگاه نباید دوباره اعمال شود
  if (appointment.depositPaid) return { success: true, companyId: "ALREADY_PAID" };
  // نوبت لغوشده/غایب نباید بیعانه ثبت کند
  if (appointment.status === "CANCELLED" || appointment.status === "NO_SHOW") {
    return { success: false, message: "این نوبت لغو شده است" };
  }

  const payment = await prisma.payment.findFirst({
    where: { appointmentId, gateway: gateway.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  // callback بدون پرداخت در انتظار معتبر نیست — قبلاً سرور خودش Payment می‌ساخت (پرداخت جعلی)
  if (!payment) return { success: false, message: "پرداخت در انتظاری برای این نوبت ثبت نشده است" };
  if (gateway.sandbox && payment.authority && authority && payment.authority !== authority) {
    return { success: false, message: "شناسهٔ پرداخت معتبر نیست" };
  }

  const amount = appointment.depositAmount ?? payment.amount;
  const paymentOrder: PaymentOrder = {
    id: appointment.id,
    appointmentId: appointment.id,
    amount,
    description: "بیعانهٔ نوبت",
    callbackUrl: payment.callbackUrl ?? "",
  };

  const result = await gateway.verifyPayment({
    order: paymentOrder,
    authority: authority ?? payment.authority ?? undefined,
    params: searchParams,
  });

  if (result.success) {
    await prisma.$transaction([
      prisma.appointment.update({
        where: { id: appointment.id },
        data: { depositPaid: true },
      }),
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", refId: result.refId, cardPan: result.cardPan, payload: { verified: result.raw } as never },
      }),
    ]);
    return { success: true, companyId: result.refId };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED", payload: { verifyFailed: result.raw } as never },
  });
  return { success: false, message: result.message ?? "پرداخت ناموفق" };
}

/** پردازش بازگشت درگاه برای فاکتورهای خدماتی مشتریان */
async function handleInvoiceCallback(
  gateway: PaymentGateway,
  invoiceId: string,
  authority?: string,
  searchParams: Record<string, string> = {}
): Promise<{ success: boolean; companyId?: string; message?: string }> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { success: false, message: "فاکتور یافت نشد" };
  if (invoice.status === "PAID") return { success: true, companyId: "PAID" };

  const payment = await prisma.payment.findFirst({
    where: { invoiceId, gateway: gateway.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  // callback بدون پرداخت در انتظار معتبر نیست (پیش‌گیری از پرداخت جعلی)
  if (!payment) return { success: false, message: "پرداخت در انتظاری برای این فاکتور ثبت نشده است" };
  if (gateway.sandbox && payment.authority && authority && payment.authority !== authority) {
    return { success: false, message: "شناسهٔ پرداخت معتبر نیست" };
  }

  const paymentOrder: PaymentOrder = {
    id: invoice.id,
    amount: invoice.amount,
    description: `فاکتور ${invoice.number}`,
    callbackUrl: payment.callbackUrl ?? "",
  };

  const result = await gateway.verifyPayment({
    order: paymentOrder,
    authority: authority ?? payment.authority ?? undefined,
    params: searchParams,
  });

  if (result.success) {
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAID", paidAt: new Date() },
      }),
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", refId: result.refId, cardPan: result.cardPan, payload: { verified: result.raw } as never },
      }),
    ]);
    return { success: true, companyId: result.refId };
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED", payload: { verifyFailed: result.raw } as never },
  });
  return { success: false, message: result.message ?? "پرداخت ناموفق" };
}
