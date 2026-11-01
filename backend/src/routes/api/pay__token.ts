// خودکار: پورت‌شده از src/app/api/pay/[token]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPaymentForInvoice } from "@/lib/payments/engine";
import { json, apiError } from "@/lib/utils";


/** اطلاعات عمومی فاکتور برای صفحه پرداخت مشتری (بدون نیاز به لاگین) */
export async function GET(_req: Request, { params }: { params: { token: string } | Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { payToken: token },
      select: {
        id: true,
        number: true,
        kind: true,
        amount: true,
        description: true,
        customerName: true,
        status: true,
        issuedAt: true,
        dueAt: true,
        paidAt: true,
        salon: { select: { name: true, city: true, slug: true } },
      },
    });
    if (!invoice) return json({ success: false, error: "فاکتور یافت نشد" }, { status: 404 });
    return json({ success: true, invoice });
  } catch (err) {
    return apiError(err);
  }
}

const paySchema = z.object({ gateway: z.string().optional() });

/** ساخت درخواست پرداخت برای فاکتور و دریافت لینک درگاه */
export async function POST(req: Request, { params }: { params: { token: string } | Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = paySchema.parse(await req.json().catch(() => ({})));

    const invoice = await prisma.invoice.findUnique({ where: { payToken: token }, select: { id: true, status: true } });
    if (!invoice) return json({ success: false, error: "فاکتور یافت نشد" }, { status: 404 });
    if (invoice.status === "PAID") return json({ success: false, error: "این فاکتور قبلاً پرداخت شده است" }, { status: 400 });

    const { payment, gateway } = await createPaymentForInvoice({ invoiceId: invoice.id, gateway: body.gateway });
    return json({ success: true, gateway, redirectUrl: payment.redirectUrl, paymentId: payment.id });
  } catch (err) {
    return apiError(err);
  }
}
