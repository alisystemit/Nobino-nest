// خودکار: پورت‌شده از src/app/api/admin/reviews/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { json, apiError, getPagination } from "@/lib/utils";

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const { page, limit, skip, take } = getPagination(req.url, 25, 200);
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        include: { salon: { select: { name: true, slug: true } }, customer: { select: { name: true, phone: true } }, staff: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.review.count(),
    ]);
    return json({ success: true, reviews, total, page, limit });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await req.json();
    const before = await prisma.review.findUnique({ where: { id } });
    if (!before) return json({ success: false, error: "نظر یافت نشد" }, { status: 404 });
    await prisma.review.delete({ where: { id } });
    await logAudit({ actorId: user.id, actorPhone: user.phone, action: "delete_review", entityType: "Review", entityId: id, before: { rating: before.rating, salonId: before.salonId } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}

