// خودکار: پورت‌شده از src/app/api/favorites/route.ts — بدون تغییر منطق


import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const { page, limit, skip, take } = getPagination(_req.url, 20, 100);
    const where = { userId: user.id };
    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        include: { salon: { select: { id: true, slug: true, name: true, city: true, coverColor: true, bannerUrl: true, salonType: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.favorite.count({ where }),
    ]);
    return json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      favorites: favorites.map((f) => ({ id: f.id, salon: f.salon })),
    });
  } catch (err) {
    return apiError(err);
  }
}

