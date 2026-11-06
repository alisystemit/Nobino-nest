import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PaymentStatus, Prisma } from "@prisma/client";
import { assertPositiveMoney } from "@/lib/money";

/** کلاینت تراکنش — برای صدور فاکتور داخل همان تراکنش پرداخت */
type Db = Prisma.TransactionClient;

function invoiceNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0");
  return `INV-${y}${m}${d}-${rand}`;
}

/** ساخت فاکتور خدماتی برای مشتری (قابل پرداخت آنلاین با لینک پیامکی) */
export async function createServiceInvoice(params: {
  salonId: string;
  customerName?: string;
  customerPhone?: string;
  description?: string;
  amount: number;
}) {
  if (!Number.isFinite(params.amount) || params.amount <= 0) {
    throw new Error("مبلغ فاکتور نامعتبر است");
  }
  const amount = assertPositiveMoney(Math.round(params.amount), "مبلغ فاکتور");
  return prisma.invoice.create({
    data: {
      number: invoiceNumber(),
      salonId: params.salonId,
      kind: "SERVICE",
      customerName: params.customerName?.trim() || null,
      customerPhone: params.customerPhone?.trim() || null,
      description: params.description?.trim() || null,
      payToken: randomBytes(16).toString("hex"),
      amount,
      period: "ONCE",
      status: "PENDING",
      issuedAt: new Date(),
      dueAt: new Date(Date.now() + 7 * 864e5),
    },
  });
}

/** یافتن فاکتور از روی توکن پرداخت عمومی */
export async function getInvoiceByPayToken(token: string) {
  if (!token) return null;
  return prisma.invoice.findUnique({
    where: { payToken: token },
    include: { salon: { select: { id: true, name: true, slug: true, city: true } } },
  });
}

/**
 * ساخت فاکتور برای یک سفارش پرداخت‌شده یا در انتظار پرداخت.
 * `client` اختیاری است تا مسیر پرداخت بتواند آن را در همان تراکنش صدا بزند
 * (وگرنه فاکتور ممکن است بعد از ثبت پرداخت ساخته نشود).
 */
export async function generateInvoiceForOrder(
  orderId: string,
  subscriptionId?: string | null,
  client?: Db,
) {
  const db = client ?? prisma;
  const order = await db.order.findUnique({ where: { id: orderId }, include: { package: true } });
  if (!order) return null;

  const isPaid = order.status === "PAID";
  const existing = await db.invoice.findUnique({ where: { orderId } });
  if (existing) {
    // اگر فاکتور پیش از پرداخت ساخته شده باشد (مثلاً تمدید اشتراک)، بعد از
    // پرداخت موفق باید PAID شود؛ قبلاً دست‌نخورده PENDING می‌ماند و گزارش
    // مالی با وضعیت سفارش ناسازگار می‌شد.
    const needsPaid = isPaid && existing.status !== "PAID";
    const needsSubscription = subscriptionId != null && existing.subscriptionId !== subscriptionId;
    if (needsPaid || needsSubscription) {
      return db.invoice.update({
        where: { id: existing.id },
        data: {
          ...(needsPaid ? { status: "PAID" as const, paidAt: existing.paidAt ?? new Date() } : {}),
          ...(needsSubscription ? { subscriptionId } : {}),
        },
      });
    }
    return existing;
  }

  return db.invoice.create({
    data: {
      number: invoiceNumber(),
      salonId: order.salonId ?? "",
      subscriptionId: subscriptionId ?? null,
      orderId: order.id,
      amount: order.amount,
      originalAmount: order.originalAmount,
      period: order.period,
      status: isPaid ? "PAID" : "PENDING",
      issuedAt: new Date(),
      dueAt: isPaid ? null : new Date(Date.now() + 7 * 864e5),
      paidAt: isPaid ? new Date() : null,
    },
  });
}

export async function updateInvoiceStatus(orderId: string, status: PaymentStatus) {
  const invoice = await prisma.invoice.findUnique({ where: { orderId } });
  if (!invoice) return null;
  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { status, paidAt: status === "PAID" ? new Date() : null },
  });
}
