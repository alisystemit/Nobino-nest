import { prisma } from "@/lib/prisma";

/**
 * یاریاب‌های خواندن سالنِ «اصلی» یک کاربر.
 *
 * از وقتی سقف «تعداد سالن هر کاربر» قابل تنظیم است، یک مالک می‌تواند بیش از یک
 * سالن داشته باشد؛ مسیرهایی که قبلاً با `findUnique({ where: { ownerId } })` تک‌سالن
 * فرض می‌کردند باید این توابع را صدا بزنند تا ترتیب مشخصی (قدیمی‌ترین سالن) داشته
 * باشند و در تایپ‌اسکیپ هم خطا ندهند.
 */

/** شناسهٔ سالن اصلی (اولین سالنی که کاربر ساخته) — برای مسیرهای تک‌سالن */
export async function getPrimarySalonId(userId: string): Promise<string | null> {
  const salon = await prisma.salon.findFirst({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return salon?.id ?? null;
}

/** سالن‌های کاربر، قدیمی‌ترین اول — برای سوییچر داشبورد */
export async function listOwnerSalons(userId: string) {
  return prisma.salon.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, plan: true, coverColor: true },
  });
}

/**
 * سالن جاری داشبورد: اگر `salonId` از کوئری بیاید و به کاربر تعلق داشته باشد همان،
 * وگرنه سالن اصلی. (برای ادمین هر سالنی مجاز است.)
 */
export async function resolveDashboardSalonId(userId: string, requested?: string | null, isAdmin = false) {
  if (requested) {
    if (isAdmin) return requested;
    const own = await prisma.salon.findFirst({
      where: { id: requested, ownerId: userId },
      select: { id: true },
    });
    if (own) return own.id;
  }
  return getPrimarySalonId(userId);
}
