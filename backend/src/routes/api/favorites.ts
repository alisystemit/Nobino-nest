// خودکار: پورت‌شده از src/app/api/favorites/route.ts — بدون تغییر منطق


import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const favorites = await prisma.favorite.findMany({
      where: { userId: user.id },
      include: { salon: { select: { id: true, slug: true, name: true, city: true, coverColor: true, bannerUrl: true } } },
      orderBy: { createdAt: "desc" },
    });
    return json({
      success: true,
      favorites: favorites.map((f) => ({ id: f.id, salon: f.salon })),
    });
  } catch (err) {
    return apiError(err);
  }
}

