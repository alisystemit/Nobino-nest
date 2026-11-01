// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/invoices/[invoiceId]/resend/route.ts — بدون تغییر منطق
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { enqueueSms } from "@/lib/notifications/queue";
import { json, apiError } from "@/lib/utils";


/** ارسال مجدد پیامک لینک پرداخت فاکتور خدماتی */
export async function POST(_req: Request, { params }: { params: { id: string; invoiceId: string } | Promise<{ id: string; invoiceId: string }> }) {
  try {
    const { id, invoiceId } = await params;
    await requireSalonManage(id);

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, salonId: id }, include: { salon: { select: { name: true } } } });
    if (!invoice) return json({ success: false, error: "فاکتور یافت نشد" }, { status: 404 });
    if (invoice.status === "PAID") return json({ success: false, error: "این فاکتور قبلاً پرداخت شده است" }, { status: 400 });
    if (!invoice.payToken || !invoice.customerPhone) {
      return json({ success: false, error: "این فاکتور لینک پرداخت ندارد" }, { status: 400 });
    }

    const origin = new URL(_req.url).origin;
    const payLink = `${origin}/pay/${invoice.payToken}`;
    const message =
      `${invoice.customerName ? invoice.customerName + " عزیز، " : "مشتری عزیز، "}` +
      `یادآوری: فاکتور ${invoice.number} به مبلغ ${invoice.amount.toLocaleString("fa-IR")} تومان از «${invoice.salon.name}» در انتظار پرداخت است. ` +
      `برای پرداخت آنلاین: ${payLink}`;

    await enqueueSms({
      type: "INVOICE_PAY_LINK",
      recipient: invoice.customerPhone,
      message,
      uniqueKey: `invoice-sms:${invoice.id}:${Math.floor(Date.now() / 864e5)}`,
      salonId: invoice.salonId ?? id,
    });

    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
