// خودکار: پورت‌شده از src/app/api/admin/invoices/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** مشاهده فاکتورها/پرداخت‌ها از پنل سوپرادمین */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const invoices = await prisma.invoice.findMany({
      where: status ? { status: status as never } : {},
      include: { salon: { select: { id: true, name: true, slug: true } } },
      orderBy: { issuedAt: "desc" },
      take: 500,
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
