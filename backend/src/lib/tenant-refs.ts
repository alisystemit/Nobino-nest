/**
 * اعتبارسنجی تعلق ارجاع‌ها به یک سالن (جداسازی مستأجرها).
 *
 * همهٔ مسیرهای نوشتن که شناسهٔ خدمت/کارمند/شعبه/کاربر را از بدنهٔ درخواست
 * می‌گیرند باید از این‌ها عبور کنند؛ وگرنه صاحب سالن «الف» می‌تواند با حدس
 * شناسه، تعریف سالن «ب» را به داده‌های خودش وصل کند.
 */
import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/utils";

const MAX_IDS = 50;

/** شناسه‌های خدمات؛ باید همگی متعلق به همین سالن باشند. آرایهٔ یکسان‌شده برمی‌گرداند. */
export async function assertServicesOfSalon(serviceIds: string[] | undefined, salonId: string, label = "خدمت"): Promise<string[]> {
  const ids = Array.from(new Set((serviceIds ?? []).map((s) => String(s ?? "").trim()).filter(Boolean)));
  if (ids.length === 0) return [];
  if (ids.length > MAX_IDS) throw httpError(`تعداد ${label}‌های انتخابی بیشتر از حد مجاز است.`, 400);
  const found = await prisma.service.findMany({ where: { id: { in: ids }, salonId }, select: { id: true } });
  if (found.length !== ids.length) throw httpError(`${label} انتخابی یافت نشد یا متعلق به این سالن نیست.`, 400);
  return ids;
}

/** شعبه باید متعلق به همین سالن باشد */
export async function assertBranchOfSalon(branchId: string | null | undefined, salonId: string) {
  const id = String(branchId ?? "").trim();
  if (!id) return;
  const found = await prisma.branch.findFirst({ where: { id, salonId }, select: { id: true } });
  if (!found) throw httpError("شعبه انتخابی متعلق به این سالن نیست.", 400);
}

/** آرایشگر/کارمند باید متعلق به همین سالن باشد */
export async function assertStaffOfSalon(staffId: string | null | undefined, salonId: string) {
  const id = String(staffId ?? "").trim();
  if (!id) return;
  const found = await prisma.staff.findFirst({ where: { id, salonId }, select: { id: true } });
  if (!found) throw httpError("کارمند انتخابی متعلق به این سالن نیست.", 400);
}

/**
 * حساب متصل به کارمند: فقط کاربر موجود و فعال (این شناسه تعیین می‌کند کمیسیون
 * به کیف پول چه کسی می‌نشیند، پس نباید هر رشته‌ای پذیرفته شود).
 */
export async function assertUserAccount(userId: string | null | undefined, label = "کاربر") {
  const id = String(userId ?? "").trim();
  if (!id) return;
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } });
  if (!user) throw httpError(`${label} انتخابی یافت نشد.`, 400);
  if (!user.isActive) throw httpError(`${label} انتخابی غیرفعال است.`, 400);
}
