import { prisma } from "@/lib/prisma";
import { generateInvoiceForOrder } from "@/lib/invoices";
import { getGateway } from "@/lib/payments/registry";
import type { PaymentGateway, PaymentOrder } from "@/lib/payments/types";
import { env } from "@/lib/env";
import { settingOrEnv } from "@/lib/settings";

/**
 * موتور پرداخت - هماهنگ‌کننده همه درگاه‌ها.
 * مراحل: ساخت Order و Payment → دریافت لینک درگاه → بازگشت → Verify → به‌روزرسانی.
 */

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
  const gateway = getGateway(gwId);

  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    include: { package: true, user: true },
  });
  if (!order) throw new Error("سفارش یافت نشد");
  if (order.status === "PAID") throw new Error("سفارش قبلاً پرداخت شده است");

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
  const gateway = getGateway(gwId);

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.invoiceId },
    include: { salon: { select: { name: true } } },
  });
  if (!invoice) throw new Error("فاکتور یافت نشد");
  if (invoice.status === "PAID") throw new Error("فاکتور قبلاً پرداخت شده است");

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
 * پردازش بازگشت (Callback) از درگاه.
 * پس از Verify موفق، وضعیت Order و Payment به PAID تغییر می‌کند.
 */
export async function handlePaymentCallback(params: {
  gatewayId: string;
  orderId?: string;
  invoiceId?: string;
  authority?: string;
  searchParams: Record<string, string>;
}): Promise<{ success: boolean; companyId?: string; message?: string }> {
  if (params.invoiceId) {
    return handleInvoiceCallback(getGateway(params.gatewayId), params.invoiceId, params.authority, params.searchParams);
  }
  const gateway = getGateway(params.gatewayId);
  const orderId = params.orderId ?? "";
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { package: true, user: true } });
  if (!order) return { success: false, message: "سفارش یافت نشد" };

  const payment = await prisma.payment.findFirst({
    where: { orderId: order.id, gateway: params.gatewayId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  const paymentOrder: PaymentOrder = {
    id: order.id,
    amount: order.amount,
    description: "پرداخت",
    callbackUrl: payment?.callbackUrl ?? "",
  };

  const result = await gateway.verifyPayment({
    order: paymentOrder,
    authority: params.authority ?? payment?.authority ?? undefined,
    params: params.searchParams,
  });

  if (result.success) {
    await prisma.$transaction([
      prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } }),
      prisma.payment.update({
        where: { id: payment?.id ?? "" },
        data: { status: "PAID", refId: result.refId, cardPan: result.cardPan, payload: { verified: result.raw } as never },
      }),
      // اگر تخفیف به‌کار رفته، شمارنده استفاده را یک واحد افزایش بده
      ...(order.discountId
        ? [prisma.discount.update({ where: { id: order.discountId }, data: { usedCount: { increment: 1 } } })]
        : []),
    ]);

    // فعال‌سازی اشتراک پکیج برای سالن
    if (order.salonId && order.packageId) {
      const { activateSubscription } = await import("@/lib/subscriptions");
      await activateSubscription({ salonId: order.salonId, packageId: order.packageId, period: order.period, autoRenew: order.autoRenew });
      const activeSubscription = await prisma.subscription.findFirst({
        where: { salonId: order.salonId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      });
      await generateInvoiceForOrder(order.id, activeSubscription?.id ?? null).catch(() => {});
    }

    // کمیسیون نمایندگان فعال سالن از مبلغ سفارش پرداخت‌شده
    if (order.salonId && order.status !== "FAILED") {
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

    return { success: true, companyId: result.refId };
  }

  await prisma.payment.update({
    where: { id: payment?.id ?? "" },
    data: { status: "FAILED", payload: { verifyFailed: result.raw } as never },
  });

  return { success: false, message: result.message ?? "پرداخت ناموفق" };
}

/** برای درگاه‌های sandbox، این مسیر پرداخت تست را شبیه‌سازی می‌کند */
export async function simulateSandboxPay(params: { orderId: string; authority?: string }) {
  if (!params.orderId) return { success: false, message: "شناسه پرداخت نامعتبر" };
  const order = await prisma.order.findUnique({ where: { id: params.orderId } });
  if (!order) {
    // پرداخت فاکتور خدماتی (شناسه، شناسه فاکتور است)
    const invoice = await prisma.invoice.findUnique({ where: { id: params.orderId } });
    if (!invoice) return { success: false, message: "سفارش یافت نشد" };
    return { success: true, note: "پرداخت تست شبیه‌سازی‌شده", invoiceId: params.orderId };
  }
  return { success: true, note: "پرداخت تست شبیه‌سازی‌شده", orderId: params.orderId };
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

  const paymentOrder: PaymentOrder = {
    id: invoice.id,
    amount: invoice.amount,
    description: `فاکتور ${invoice.number}`,
    callbackUrl: payment?.callbackUrl ?? "",
  };

  const result = await gateway.verifyPayment({
    order: paymentOrder,
    authority: authority ?? payment?.authority ?? undefined,
    params: searchParams,
  });

  if (result.success) {
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "PAID", paidAt: new Date() },
      }),
      payment
        ? prisma.payment.update({
            where: { id: payment.id },
            data: { status: "PAID", refId: result.refId, cardPan: result.cardPan, payload: { verified: result.raw } as never },
          })
        : prisma.payment.create({
            data: {
              invoiceId: invoice.id,
              gateway: gateway.id,
              amount: invoice.amount,
              status: "PAID",
              refId: result.refId,
              cardPan: result.cardPan,
              payload: { verified: result.raw } as never,
            },
          }),
    ]);
    return { success: true, companyId: result.refId };
  }

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", payload: { verifyFailed: result.raw } as never },
    });
  }
  return { success: false, message: result.message ?? "پرداخت ناموفق" };
}
