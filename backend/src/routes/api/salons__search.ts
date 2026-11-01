// خودکار: پورت‌شده از src/app/api/salons/search/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { json, getPagination } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

/** جستجو و فیلتر سالن‌ها بر اساس منطقه، خدمت و قیمت */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const city = url.searchParams.get("city") ?? "";
  const service = url.searchParams.get("service") ?? "";
  const maxPrice = Number(url.searchParams.get("maxPrice") ?? 0);
  const { page, limit, skip, take } = getPagination(url, 50, 100);

  const where: Prisma.SalonWhereInput = { isApproved: true, isActive: true };

  if (city) where.city = { contains: city, mode: "insensitive" };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  // فیلتر خدمت / قیمت از طریق رابطه services
  const serviceFilter: Prisma.ServiceListRelationFilter = {};
  if (service) serviceFilter.some = { name: { contains: service, mode: "insensitive" } };
  if (maxPrice > 0) serviceFilter.some = { ...(serviceFilter.some ?? {}), price: { lte: maxPrice } };
  if (service || maxPrice > 0) where.services = serviceFilter;

  const [salons, total] = await Promise.all([
    prisma.salon.findMany({
      where,
      select: {
        id: true,
        slug: true,
        name: true,
        city: true,
        address: true,
        coverColor: true,
        bannerUrl: true,
        logoUrl: true,
        description: true,
        _count: { select: { reviews: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.salon.count({ where }),
  ]);

  // میانگین امتیازها
  const ids = salons.map((s) => s.id);
  const ratings = ids.length
    ? await prisma.review.groupBy({ by: ["salonId"], where: { salonId: { in: ids } }, _avg: { rating: true }, _count: { _all: true } })
    : [];

  const ratingMap = new Map(ratings.map((r) => [r.salonId, r]));

  return json({
    success: true,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    salons: salons.map((s) => ({
      ...s,
      rating: ratingMap.get(s.id)?._avg.rating ?? null,
      reviewCount: ratingMap.get(s.id)?._count._all ?? 0,
    })),
  });
}
