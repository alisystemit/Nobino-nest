import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/utils";
import { randomSalonSlug, slugCandidates } from "@/lib/slug";

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

/**
 * رزرو اسلاگ یکتا برای سالن جدید (یا تغییر اسلاگ سالن).
 * اسلاگ همان آدرس عمومی/ساب‌دامین سالن است، پس باید یکتا باشد.
 * اگر `wanted` داده نشده باشد، اسلاگ از نام سالن ساخته می‌شود.
 * @throws اگر اسلاگ درخواستی گرفته شده باشد و `strict` باشد
 */
export async function reserveSalonSlug(wanted: string | null | undefined, name: string, strict = false): Promise<string> {
  const requested = String(wanted ?? "").trim().toLowerCase();
  const candidates = slugCandidates(requested || name);
  const taken = new Set(
    (await prisma.salon.findMany({ where: { slug: { in: candidates } }, select: { slug: true } })).map((s) => s.slug),
  );
  if (requested && taken.has(requested) && strict) {
    throw httpError("این آدرس قبلاً استفاده شده است؛ یک اسلاگ دیگر انتخاب کنید", 409);
  }
  const free = candidates.find((c) => !taken.has(c));
  if (free) return free;
  // همهٔ نامزدها گرفته بود: اسلاگ تصادفی معتبر (با یک بار بررسی)
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSalonSlug();
    const exists = await prisma.salon.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  throw new Error("ساخت آدرس اختصاصی ممکن نشد؛ دوباره تلاش کنید");
}

/** آیا اسلاگ آزاد است؟ (برای پیشنهاد زنده در فرم ساخت سالن) */
export async function isSlugFree(slug: string): Promise<boolean> {
  const normalized = String(slug ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const exists = await prisma.salon.findUnique({ where: { slug: normalized }, select: { id: true } });
  return !exists;
}
