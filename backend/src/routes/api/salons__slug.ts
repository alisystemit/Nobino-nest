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
      timezone: salon.timezone,
      // راه‌های تماس/موقعیت — مینی‌اپ پیام‌رسان این‌ها را در صفحهٔ خانه نشان می‌دهد
      whatsapp: salon.whatsapp,
      instagram: salon.instagram,
      website: salon.website,
      mapUrl: salon.mapUrl,
      neshanUrl: salon.neshanUrl,
      baladUrl: salon.baladUrl,
      // تنظیمات بیعانهٔ نوبت — صفحهٔ رزرو بر همین اساس مبلغ پیش‌پرداخت را اعلام می‌کند
      depositEnabled: salon.depositEnabled,
      depositMode: salon.depositMode,
      depositValue: salon.depositValue,
      services: salon.services.map((s) => ({
        id: s.id,
        name: s.name,
        durationMin: s.durationMin,
        price: s.price,
        description: s.description,
        // «تازه‌ترین پکیج‌ها» در مینی‌اپ بر همین اساس مرتب می‌شود
        category: s.category,
        createdAt: s.createdAt.toISOString(),
      })),
      gallery: salon.galleryItems,
      hours: salon.openingHours,
    },
  });
}
