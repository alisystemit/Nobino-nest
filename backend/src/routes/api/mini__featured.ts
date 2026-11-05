/**
 * سالن‌های ویژهٔ صفحهٔ اول مینی‌اپ — `GET /api/mini/featured`
 *
 * اسلاگ‌ها را سوپرادمین در «مینی‌اپ پیام‌رسان‌ها → سالن‌های ویژه» تنظیم می‌کند.
 * ترتیب دقیقاً همان ترتیب پنل است و سالنِ غیرفعال/تأییدنشده حذف می‌شود.
 */
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/utils";
import { readMiniConfig } from "@/lib/mini/config";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  const cfg = await readMiniConfig();
  if (cfg.featured.length === 0) return json({ success: true, salons: [] });

  const rows = await prisma.salon.findMany({
    where: { slug: { in: cfg.featured }, isActive: true, isApproved: true },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      address: true,
      coverColor: true,
      salonType: true,
      bannerUrl: true,
      logoUrl: true,
      description: true,
      _count: { select: { reviews: true } },
    },
  });

  const ids = rows.map((s) => s.id);
  const ratings = ids.length
    ? await prisma.review.groupBy({ by: ["salonId"], where: { salonId: { in: ids } }, _avg: { rating: true }, _count: { _all: true } })
    : [];
  const byId = new Map(ratings.map((r) => [r.salonId, r]));

  // ترتیب پنل حفظ می‌شود
  const ordered = cfg.featured
    .map((slug) => rows.find((s) => s.slug === slug))
    .filter((s): s is (typeof rows)[number] => Boolean(s));

  return json({
    success: true,
    salons: ordered.map((s) => ({
      ...s,
      rating: byId.get(s.id)?._avg.rating ?? null,
      reviewCount: byId.get(s.id)?._count._all ?? 0,
    })),
  });
}
