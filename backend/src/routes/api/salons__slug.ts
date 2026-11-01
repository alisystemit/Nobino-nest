// خودکار: پورت‌شده از src/app/api/salons/[slug]/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/utils";


// پارامترهای مسیر async هستند
export async function GET(_req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  const { slug } = await params;

  const salon = await prisma.salon.findUnique({
    where: { slug },
    include: {
      services: { where: { isActive: true } },
      galleryItems: { orderBy: { sortOrder: "asc" } },
      openingHours: true,
    },
  });

  if (!salon || !salon.isActive) {
    return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
  }

  return json({
    success: true,
    salon: {
      id: salon.id,
      slug: salon.slug,
      name: salon.name,
      phone: salon.phone,
      city: salon.city,
      address: salon.address,
      description: salon.description,
      logoUrl: salon.logoUrl,
      bannerUrl: salon.bannerUrl,
      coverColor: salon.coverColor,
      services: salon.services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMin: s.durationMin,
        price: s.price,
        description: s.description,
      })),
      gallery: salon.galleryItems,
      hours: salon.openingHours,
    },
  });
}
