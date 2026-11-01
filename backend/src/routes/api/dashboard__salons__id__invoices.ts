// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/invoices/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { createServiceInvoice } from "@/lib/invoices";
import { enqueueSms } from "@/lib/notifications/queue";
import { json, apiError } from "@/lib/utils";


/** فاکتور/رسیدهای اشتراک و خدماتی سالن */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const invoices = await prisma.invoice.findMany({
      where: { salonId: id },
      include: { subscription: { include: { package: { select: { name: true } } } } },
      orderBy: { issuedAt: "desc" },
      take: 300,
    });
    const list = invoices.map((i) => ({
      ...i,
      payLink: i.payToken ? `/pay/${i.payToken}` : null,
      payToken: undefined,
    }));
    return json({ success: true, invoices: list });
  } catch (err) {
    return apiError(err);
  }
}

const createSchema = z.object({
  customerName: z.string().trim().min(1, "نام مشتری الزامی است").max(120),
  customerPhone: z.string().trim().min(10, "شماره موبایل مشتری نامعتبر است").max(20),
  description: z.string().trim().max(500).optional(),
  amount: z.number().int().positive("مبلغ فاکتور باید عددی مثبت باشد").max(1_000_000_000),
});

/** صدور فاکتور خدماتی برای مشتری + ارسال پیامک حاوی لینک پرداخت */
export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = createSchema.parse(await req.json());

    // نرمال‌سازی شماره موبایل (اعداد فارسی → لاتین، حذف فاصله/خط تیره)
    const phone = body.customerPhone
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[\s-]/g, "");
    if (!/^09\d{9}$/.test(phone)) {
      return json({ success: false, error: "شماره موبایل مشتری باید با ۰۹ شروع شود و ۱۱ رقم باشد." }, { status: 400 });
    }

    const salon = await prisma.salon.findUnique({ where: { id }, select: { name: true } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const invoice = await createServiceInvoice({
      salonId: id,
      customerName: body.customerName,
      customerPhone: phone,
      description: body.description,
      amount: body.amount,
    });

    const origin = new URL(req.url).origin;
    const payLink = `${origin}/pay/${invoice.payToken}`;
    const message =
      `${invoice.customerName ? invoice.customerName + " عزیز، " : "مشتری عزیز، "}` +
      `فاکتور ${invoice.number} به مبلغ ${invoice.amount.toLocaleString("fa-IR")} تومان از «${salon.name}» برای شما صادر شد. ` +
      `برای پرداخت آنلاین: ${payLink}`;

    await enqueueSms({
      type: "INVOICE_PAY_LINK",
      recipient: phone,
      message,
      uniqueKey: `invoice-sms:${invoice.id}`,
      salonId: id,
    });

    return json({ success: true, invoice: { ...invoice, payToken: undefined, payLink: `/pay/${invoice.payToken}` }, payLink }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
