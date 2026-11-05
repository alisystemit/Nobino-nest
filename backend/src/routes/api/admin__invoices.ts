// خودکار: پورت‌شده از src/app/api/admin/invoices/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination, enumQueryParam } from "@/lib/utils";
import { PaymentStatus } from "@prisma/client";

/** مشاهده فاکتورها/پرداخت‌ها از پنل سوپرادمین — صفحه‌بندی سمت سرور */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    // مقدار ناشناخته → 400 فارسی، نه 500 با متن خام Prisma
    const status = enumQueryParam(url, "status", Object.values(PaymentStatus), { label: "وضعیت فاکتور" });
    const { page, limit, skip, take } = getPagination(req.url, 25, 200);
    const where = status ? { status } : {};
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { salon: { select: { id: true, name: true, slug: true } } },
        orderBy: [{ issuedAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.invoice.count({ where }),
    ]);
    const list = invoices.map((i) => ({
      ...i,
      payLink: i.payToken ? `/pay/${i.payToken}` : null,
      payToken: undefined,
    }));
    return json({ success: true, invoices: list, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}
