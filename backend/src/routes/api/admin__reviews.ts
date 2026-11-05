// خودکار: پورت‌شده از src/app/api/admin/reviews/route.ts
// A16: این endpoint هیچ فیلتری نداشت؛ حالا فیلترهای واقعی دارد و پارامتر
// ناشناخته یا مقدار نامعتبر همان‌جا 400 می‌گیرد (نه «همهٔ نظرها»).


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import { json, apiError, getPagination, assertKnownQueryParams, boolQueryParam, httpError, parseIntInput } from "@/lib/utils";

const REVIEW_FILTERS = ["page", "limit", "rating", "salon", "replied", "q"] as const;

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    assertKnownQueryParams(url, REVIEW_FILTERS);
    const { page, limit, skip, take } = getPagination(url, 25, 200);

    const where: Prisma.ReviewWhereInput = {};

    const ratingRaw = url.searchParams.get("rating");
    if (ratingRaw !== null && ratingRaw.trim() !== "") {
      const r = parseIntInput(ratingRaw, "امتیاز", { min: 1, max: 5 });
      if (!r.ok) throw httpError(r.error, 400);
      where.rating = r.value;
    }

    const salon = url.searchParams.get("salon")?.trim();
    if (salon) where.salon = { slug: salon.toLowerCase() };

    const replied = boolQueryParam(url, "replied", { label: "پاسخ داده شده" });
    if (replied === true) where.reply = { not: null };
    if (replied === false) where.reply = null;

    const q = url.searchParams.get("q")?.trim();
    if (q) {
      where.OR = [
        { comment: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { phone: { contains: q } } },
      ];
    }

    const [reviews, total, ratingCounts] = await Promise.all([
      prisma.review.findMany({
        where,
        include: { salon: { select: { name: true, slug: true } }, customer: { select: { name: true, phone: true } }, staff: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.review.count({ where }),
      prisma.review.groupBy({ by: ["rating"], _count: { _all: true } }),
    ]);

    const counts: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const g of ratingCounts) counts[String(g.rating)] = g._count._all;

    return json({ success: true, reviews, total, page, limit, counts });
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

