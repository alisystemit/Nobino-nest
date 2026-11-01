// خودکار: پورت‌شده از src/app/api/account/reviews/route.ts — بدون تغییر منطق


import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination } from "@/lib/utils";

/** نظرات ثبت‌شده توسط کاربر جاری — صفحه‌بندی‌شده */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const { page, limit, skip, take } = getPagination(_req.url, 20, 100);
    const where = { customerId: user.id };
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          salon: { select: { name: true, slug: true } },
          staff: { select: { name: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.review.count({ where }),
    ]);
    return json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      reviews: reviews.map((r) => ({
        id: r.id,
        appointmentId: r.appointmentId,
        rating: r.rating,
        comment: r.comment,
        salonName: r.salon.name,
        salonSlug: r.salon.slug,
        staff: r.staff?.name ?? null,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

