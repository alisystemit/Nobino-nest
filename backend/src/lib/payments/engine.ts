import { prisma } from "@/lib/prisma";
import { generateInvoiceForOrder } from "@/lib/invoices";
import { getGateway } from "@/lib/payments/registry";
import type { PaymentGateway, PaymentOrder, PaymentVerifyResult } from "@/lib/payments/types";
import type { ActivatedSubscription, RenewedSubscription } from "@/lib/subscriptions";
import type { Prisma } from "@prisma/client";
import { sandboxModeAllowed } from "@/lib/payments/gateway-config";
import { assertPositiveMoney, asNumber } from "@/lib/money";
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
 * درگاه‌هایی که مبلغ تأییدشده را برمی‌گردانند باید با مبلغ پرداخت یکی باشند.
 * (بعضی درگاه‌ها مبلغ را برنمی‌گردانند؛ برای آن‌ها خود درگاه مبلغ درخواستی را
 * اعتبارسنجی می‌کند و این تابع false می‌دهد.)
 */
function verifiedAmountMismatch(result: PaymentVerifyResult, expected: number): boolean {
  return typeof result.amount === "number" && Number.isFinite(result.amount) && result.amount !== expected;
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
  const orderAmount = asNumber(order.amount);
  assertPositiveMoney(orderAmount, "مبلغ سفارش");

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
      amount: orderAmount,
      status: "PENDING",
      callbackUrl,
    },
  });

  const paymentOrder: PaymentOrder = {
    id: order.id,
    amount: orderAmount,
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
  const invoiceAmount = asNumber(invoice.amount);
  assertPositiveMoney(invoiceAmount, "مبلغ فاکتور");

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
      amount: invoiceAmount,
      status: "PENDING",
      callbackUrl,
    },
  });

  const paymentOrder: PaymentOrder = {
    id: invoice.id,
    amount: invoiceAmount,
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
  const amount = asNumber(appointment.depositAmount ?? 0);
  if (amount <= 0) throw httpError("برای این نوبت بیعانه تعریف نشده است", 400);
  assertPositiveMoney(amount, "مبلغ بیعانه");

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
 *
 * **باید داخل همان تراکنشی اجرا شود که وضعیت Order/Payment را PAID می‌کند.**
 * قبلاً بعد از تراکنش و جدا اجرا می‌شد؛ اگر فعال‌سازی/فاکتور شکست می‌خورد،
 * سفارش «پرداخت‌شده» می‌ماند ولی اشتراک فعال نمی‌شد. حالا هر خطا کل تراکنش
 * را rollback می‌کند.
 *
 * پیامک فعال‌سازی عمداً اینجا صف نمی‌شود؛ فراخوان بعد از commit آن را
 * best-effort صدا می‌زند (`notifyActivatedSubscription`).
 */
export async function finalizePaidOrder(
  order: {
    id: string;
    salonId: string | null;
    packageId: string;
    period: string;
    autoRenew: boolean;
    /** مبلغ ممکن است مستقیم از Prisma (bigint) یا محاسبه‌شده (number) بیاید */
    amount: number | bigint;
    /** اگر پر باشد، این سفارش «تمدید» است و اشتراک موجود جلو می‌رود */
    renewalSubscriptionId?: string | null;
  },
  tx: Prisma.TransactionClient,
): Promise<{ subscription?: ActivatedSubscription; renewal?: RenewedSubscription }> {
  if (!order.salonId) return {};
  const salonId = order.salonId;
  const amount = asNumber(order.amount);

  /** کمیسیون نمایندگان فعال سالن از مبلغ سفارش پرداخت‌شده (داخل همان تراکنش) */
  const applyCommissions = async () => {
    const plans = await tx.commissionPlan.findMany({
      where: { salonId, isActive: true },
      select: { agentId: true, percent: true },
    });
    for (const plan of plans) {
      if (plan.percent > 0) {
        const { applyCommissionOnAmount } = await import("@/lib/financial/commission");
        await applyCommissionOnAmount({
          agentId: plan.agentId,
          salonId,
          amount,
          client: tx,
        });
      }
    }
  };

  const { activateSubscriptionTx, renewSubscriptionTx } = await import("@/lib/subscriptions");

  // سفارش تمدید: همان اشتراکِ موجود جلو می‌رود و هیچ رکورد ACTIVE دومی
  // ساخته نمی‌شود. اگر اشتراک دیگر ACTIVE نباشد، تراکنش rollback می‌شود تا
  // پرداخت موفق بدون سرویس نماند.
  if (order.renewalSubscriptionId) {
    const renewal = await renewSubscriptionTx(tx, order.renewalSubscriptionId);
    if (!renewal) throw new Error("اشتراک قابل تمدید نیست");
    await generateInvoiceForOrder(order.id, renewal.subscriptionId, tx);
    await applyCommissions();
    return { renewal };
  }

  const subscription = await activateSubscriptionTx(tx, {
    salonId: order.salonId,
    packageId: order.packageId,
    period: order.period,
    autoRenew: order.autoRenew,
  });
  await generateInvoiceForOrder(order.id, subscription.subscriptionId, tx);
  await applyCommissions();

  return { subscription };
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
    amount: asNumber(order.amount),
    description: "پرداخت",
    callbackUrl: payment.callbackUrl ?? "",
  };

  const result = await gateway.verifyPayment({
    order: paymentOrder,
    authority: params.authority ?? payment.authority ?? undefined,
    params: params.searchParams,
  });

  if (result.success) {
    // مبلغ تأییدشده (اگر درگاه برگرداند) باید با مبلغ همین Payment بخواند
    const paymentAmount = asNumber(payment.amount);
    if (verifiedAmountMismatch(result, paymentAmount)) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", payload: { verifyMismatch: result.raw, expected: paymentAmount, got: result.amount } as never },
      });
      return { success: false, message: "مبلغ تأییدشده با مبلغ پرداخت مطابقت ندارد" };
    }

    // پرداخت، سفارش، تخفیف، اشتراک، فاکتور و کمیسیون همه در یک تراکنش.
    // updateMany شرطی، دو callback هم‌زمان را به یک «برنده» محدود می‌کند تا
    // اشتراک/کمیسیون دوبار اعمال نشود (idempotency واقعی، نه فقط بررسی وضعیت).
    const outcome:
      | { state: "ok"; subscription?: ActivatedSubscription; renewal?: RenewedSubscription }
      | { state: "duplicate" }
      | { state: "duplicateCharge" } = await prisma.$transaction(async (tx) => {
      const paid = await tx.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          status: "PAID",
          refId: result.refId,
          cardPan: result.cardPan,
          payload: { verified: result.raw } as never,
        },
      });
      // callback تکراری/هم‌زمان برای همین پرداخت
      if (paid.count !== 1) return { state: "duplicate" as const };

      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: { not: "PAID" } },
        data: { status: "PAID" },
      });
      if (claimed.count !== 1) {
        // سفارش هم‌زمان با callback دیگری PAID شده ولی این پرداخت هم
        // واقعاً انجام شده است. آن را PAID نگه می‌داریم تا تراکنش مالی گم
        // نشود (برای پیگیری/بازپرداخت دستی) ولی مزایا را دوباره نمی‌دهیم.
        await tx.payment.update({
          where: { id: payment.id },
          data: { payload: { verified: result.raw, duplicateCharge: true } as never },
        });
        return { state: "duplicateCharge" as const };
      }

      // اگر تخفیف به‌کار رفته، شمارنده استفاده را یک واحد افزایش بده
      if (order.discountId) {
        await tx.discount.update({
          where: { id: order.discountId },
          data: { usedCount: { increment: 1 } },
        });
      }

      return { state: "ok" as const, ...(await finalizePaidOrder(order, tx)) };
    }, { timeout: 15_000 });

    if (outcome.state !== "ok") return { success: true, companyId: "ALREADY_PAID" };

    // اعلان بیرون از تراکنش؛ شکست پیامک نباید پرداخت را زیر سؤال ببرد
    if (outcome.subscription) {
      const { notifyActivatedSubscription } = await import("@/lib/subscriptions");
      await notifyActivatedSubscription(outcome.subscription).catch(() => {});
    }
    if (outcome.renewal) {
      const { notifyRenewedSubscription } = await import("@/lib/subscriptions");
      await notifyRenewedSubscription(outcome.renewal).catch(() => {});
    }

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

  const amount = asNumber(appointment.depositAmount ?? payment.amount);
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
    if (verifiedAmountMismatch(result, asNumber(payment.amount))) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", payload: { verifyMismatch: result.raw, expected: asNumber(payment.amount), got: result.amount } as never },
      });
      return { success: false, message: "مبلغ تأییدشده با مبلغ بیعانه مطابقت ندارد" };
    }
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
    amount: asNumber(invoice.amount),
    description: `فاکتور ${invoice.number}`,
    callbackUrl: payment.callbackUrl ?? "",
  };

  const result = await gateway.verifyPayment({
    order: paymentOrder,
    authority: authority ?? payment.authority ?? undefined,
    params: searchParams,
  });

  if (result.success) {
    if (verifiedAmountMismatch(result, asNumber(payment.amount))) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", payload: { verifyMismatch: result.raw, expected: asNumber(payment.amount), got: result.amount } as never },
      });
      return { success: false, message: "مبلغ تأییدشده با مبلغ فاکتور مطابقت ندارد" };
    }
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
