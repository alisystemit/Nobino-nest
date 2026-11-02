/**
 * آرایشگرهای یک سالن برای مینی‌اپ — `GET /api/mini/staff?slug=mah`
 *
 * صفحهٔ عمومی سالن (`/api/salons/[slug]`) کارمند را شامل نمی‌شود؛ مینی‌اپ برای
 * «انتخاب آرایشگر» به همین فهرست عمومی نیاز دارد. فقط دادهٔ نمایشی برگردانده
 * می‌شود و سالن‌های غیرفعال/تأییدنشده پاسخ ندارند.
 */
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/utils";

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  if (!slug) return json({ success: false, error: "پارامتر slug لازم است" }, { status: 400 });

  const salon = await prisma.salon.findUnique({
    where: { slug },
    select: { id: true, isActive: true, isApproved: true },
  });
  if (!salon || !salon.isActive || !salon.isApproved) {
    return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
  }

  const staff = await prisma.staff.findMany({
    where: { salonId: salon.id, isActive: true },
    select: {
      id: true,
      name: true,
      title: true,
      avatarUrl: true,
      specialties: true,
      bio: true,
      branchId: true,
      services: { select: { id: true } },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 60,
  });

  const ids = staff.map((s) => s.id);
  const ratings = ids.length
    ? await prisma.review.groupBy({
        by: ["staffId"],
        where: { staffId: { in: ids } },
        _avg: { rating: true },
        _count: { _all: true },
      })
    : [];
  const byStaff = new Map(ratings.map((r) => [r.staffId, r]));

  return json({
    success: true,
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      title: s.title ?? "",
      avatarUrl: s.avatarUrl ?? "",
      specialties: s.specialties ?? [],
      bio: s.bio ?? "",
      branchId: s.branchId ?? "",
      serviceIds: s.services.map((x) => x.id),
      rating: byStaff.get(s.id)?._avg.rating ?? null,
      reviewCount: byStaff.get(s.id)?._count._all ?? 0,
    })),
  });
}
