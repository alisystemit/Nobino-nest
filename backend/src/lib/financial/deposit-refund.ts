/**
 * بازگشت بیعانهٔ پرداخت‌شده (O2).
 *
 * واقعیت موجود در دیتابیس: بیعانه از راه درگاه روی حساب فروشندهٔ سالن می‌نشیند و
 * هیچ‌وقت به کیف پول داخلی نمی‌آید (در `lib/payments/engine.ts` فقط
 * `depositPaid=true` و `Payment.status=PAID` نوشته می‌شود). هیچ درگاهی هم در این
 * پروژه متد refund ندارد. پس «بازگشت بیعانه» نمی‌تواند یک حرکت پولی ساختگی داخل
 * کیف پول باشد — این‌جا کاری که انجام می‌شود این است که بدهی **ثبت، قابل‌دیدن و
 * قابل‌تسویه** شود:
 *  ۱) به‌محض لغو/غایب شدن نوبتی که بیعانه‌اش پرداخت شده، مبلغ به‌عنوان «بازگشت
 *     در انتظار» روی همان ردیف Payment باقی می‌ماند (Payment.PAID + نوبتِ لغوشده)
 *     و به مشتری و سالن‌دار اعلان می‌شود؛
 *  ۲) سالن‌دار (یا ادمین) پس از پرداختِ واقعی، همان ردیف را با یک UPDATE مشروط
 *     تسویه می‌کند → `status=REFUNDED` و `payload.refund` (چه‌کسی/کِی/یادداشت).
 *     تسویهٔ دوبارهٔ همان ردیف به‌دلیل شرط `status: "PAID"` غیرممکن است.
 */
import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/utils";
import { asNumber } from "@/lib/money";
import { enqueueInApp, enqueueSms } from "@/lib/notifications/queue";

/** وضعیت‌هایی که نوبت را بی‌اعتبار می‌کنند و بیعانه را برگشت‌پذیر می‌سازند */
const REFUNDABLE_APPOINTMENT_STATUSES = ["CANCELLED", "NO_SHOW"] as const;

export type DepositRefundRow = {
  paymentId: string;
  appointmentId: string;
  amount: number;
  gateway: string;
  customerName: string;
  customerPhone: string;
  createdAt: Date | null;
  refundedAt: Date | null;
  settledBy: string | null;
  note: string | null;
};

type RefundPayload = { refund?: { at?: string; byUserId?: string | null; note?: string | null } };

function toRow(
  p: {
    id: string;
    amount: bigint | number;
    gateway: string;
    createdAt: Date;
    updatedAt: Date;
    appointment: { id: string; customerName: string; customerPhone: string } | null;
  },
  settled: boolean
): DepositRefundRow {
  return {
    paymentId: p.id,
    appointmentId: p.appointment?.id ?? "",
    amount: asNumber(p.amount),
    gateway: p.gateway,
    customerName: p.appointment?.customerName ?? "—",
    customerPhone: p.appointment?.customerPhone ?? "—",
    createdAt: p.createdAt,
    refundedAt: settled ? p.updatedAt : null,
    settledBy: null,
    note: null,
  };
}

/** ردیف‌های بیعانهٔ پرداخت‌شده که هنوز برگشت داده نشده‌اند (Payment.PAID روی نوبتِ لغو/غایب) */
export async function listDueDepositRefunds(salonId: string, limit = 100): Promise<DepositRefundRow[]> {
  const rows = await prisma.payment.findMany({
    where: {
      status: "PAID",
      appointment: { salonId, status: { in: [...REFUNDABLE_APPOINTMENT_STATUSES] } },
    },
    include: { appointment: { select: { id: true, customerName: true, customerPhone: true } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((p) => toRow(p, false));
}

/** بیعانه‌هایی که تسویه شده‌اند — برای اینکه تاریخچه گم نشود */
export async function listSettledDepositRefunds(salonId: string, limit = 50): Promise<DepositRefundRow[]> {
  const rows = await prisma.payment.findMany({
    where: { status: "REFUNDED", appointment: { salonId } },
    include: { appointment: { select: { id: true, customerName: true, customerPhone: true } } },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((p) => {
    const meta = (p.payload as RefundPayload | null)?.refund;
    return { ...toRow(p, true), settledBy: meta?.byUserId ?? null, note: meta?.note ?? null };
  });
}

export async function depositRefundSummary(salonId: string): Promise<{ count: number; amount: number }> {
  const agg = await prisma.payment.aggregate({
    where: { status: "PAID", appointment: { salonId, status: { in: [...REFUNDABLE_APPOINTMENT_STATUSES] } } },
    _count: { _all: true },
    _sum: { amount: true },
  });
  return { count: agg._count._all, amount: asNumber(agg._sum.amount ?? 0) };
}

/**
 * ثبت «بازگشت در انتظار» هنگام لغو/غایب شدن نوبت.
 * بی‌خطر است اگر بیعانه‌ای پرداخت نشده باشد؛ اعلان‌ها با uniqueKey یکی‌سازی می‌شوند
 * تا لغوی دوباره (یا دو مسیرِ لغو) پیام تکراری نسازد.
 */
export async function announceDepositRefundDue(appointmentId: string): Promise<{ amount: number } | null> {
  const payment = await prisma.payment.findFirst({
    where: { appointmentId, status: "PAID" },
    orderBy: { updatedAt: "desc" },
    include: { appointment: { select: { id: true, salonId: true, customerName: true, customerPhone: true, customerId: true, salon: { select: { name: true, ownerId: true } } } } },
  });
  if (!payment?.appointment) return null;
  const appt = payment.appointment;
  const amount = asNumber(payment.amount);

  const sms = `بیعانهٔ ${amount.toLocaleString("fa-IR")} تومانی نوبت «${appt.salon?.name ?? ""}» به دلیل لغو قابل بازگشت است. با سالن هماهنگ کنید تا آن را به حساب شما برگرداند.`;
  await enqueueSms({
    type: "DEPOSIT_REFUND_DUE",
    recipient: appt.customerPhone,
    message: sms,
    uniqueKey: `deposit-refund-sms:${appointmentId}`,
    salonId: appt.salonId,
  }).catch(() => {});

  if (appt.customerId) {
    await enqueueInApp({
      type: "DEPOSIT_REFUND_DUE",
      userId: appt.customerId,
      message: `بیعانهٔ ${amount.toLocaleString("fa-IR")} تومانی این نوبت قابل بازگشت است؛ سالن موظف است آن را به شما برگرداند.`,
      uniqueKey: `deposit-refund-inapp:${appointmentId}`,
      salonId: appt.salonId,
    }).catch(() => {});
  }
  if (appt.salon?.ownerId) {
    await enqueueInApp({
      type: "DEPOSIT_REFUND_DUE",
      userId: appt.salon.ownerId,
      message: `بدهی بیعانه: ${amount.toLocaleString("fa-IR")} تومان برای نوبت «${appt.customerName}» باید بازگردانده شود. پس از واریز، در بخش مالی «بازگشت انجام شد» را بزنید.`,
      uniqueKey: `deposit-refund-owner:${appointmentId}`,
      salonId: appt.salonId,
    }).catch(() => {});
  }
  return { amount };
}

/**
 * تسویهٔ یک بازگشت (پول واقعاً به مشتری برگشته). شرط `status: "PAID"` روی
 * خودِ UPDATE باعث می‌شود دو فشار هم‌زمان فقط یک‌بار بنویسد.
 */
export async function settleDepositRefund(params: {
  paymentId: string;
  salonId: string;
  byUserId: string;
  note?: string;
}): Promise<DepositRefundRow> {
  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, appointment: { salonId: params.salonId } },
    include: { appointment: { select: { id: true, customerId: true, customerName: true, customerPhone: true, salonId: true } } },
  });
  if (!payment) throw httpError("پرداخت بیعانه یافت نشد", 404);
  if (payment.status === "REFUNDED") throw httpError("این بازگشت قبلاً ثبت شده است", 409);
  if (payment.status !== "PAID") throw httpError("فقط بیعانهٔ پرداخت‌شده قابل بازگشت است", 400);

  const settledAt = new Date().toISOString();
  const merged = { ...((payment.payload as object | null) ?? {}), refund: { at: settledAt, byUserId: params.byUserId, note: params.note ?? null } };
  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: "PAID" },
    data: { status: "REFUNDED", payload: merged as never },
  });
  if (updated.count !== 1) throw httpError("این بازگشت همین حالا ثبت شد؛ فهرست را تازه کنید", 409);

  if (payment.appointment?.customerId) {
    await enqueueInApp({
      type: "DEPOSIT_REFUND_DONE",
      userId: payment.appointment.customerId,
      message: `بیعانهٔ ${payment.amount.toLocaleString("fa-IR")} تومانی بازگشت داده شد.`,
      uniqueKey: `deposit-refund-done:${payment.id}`,
      salonId: payment.appointment.salonId,
    }).catch(() => {});
  }

  const row = await prisma.payment.findUnique({
    where: { id: payment.id },
    include: { appointment: { select: { id: true, customerName: true, customerPhone: true } } },
  });
  if (!row) throw httpError("پرداخت بیعانه یافت نشد", 404);
  return { ...toRow(row, true), settledBy: params.byUserId, note: params.note ?? null };
}
