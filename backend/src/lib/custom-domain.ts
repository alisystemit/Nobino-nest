/**
 * اعتبارسنجی دامنهٔ اختصاصی سالن.
 *
 * چرا لازم شد: هم `PATCH /api/dashboard/salons/:id` و هم `POST .../domain` رشتهٔ
 * خام `customDomain` را ذخیره می‌کردند؛ نتیجه «دامنه»ای مثل
 * `https://foo/ bar` یا دامنه‌ای که قبلاً روی سالن دیگری نشسته بود، که یا
 * مسیریابی زیردامنه را می‌شکند یا روی یکتای `customDomain` خطای ۵۰۰ می‌دهند.
 */
import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/utils";

/** برچسب‌های dot-شده، فقط a-z 0-9 و خط تیره؛ بدون پروتکل، پورت یا مسیر */
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function normalizeDomain(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    // کاربر معمولاً دامنه را با پروتکل یا مسیر کپی می‌کند
    .replace(/^[a-z]+:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

export function isValidDomain(host: string): boolean {
  return HOST_RE.test(host);
}

/** نرمال + معتبر; در غیر این صورت `httpError(400)` با پیام فارسی */
export function assertValidDomain(raw: string): string {
  const host = normalizeDomain(raw);
  if (!host) throw httpError("آدرس دامنه خالی است.", 400);
  if (!isValidDomain(host)) {
    throw httpError("قالب دامنه معتبر نیست؛ مثال درست: booking.example.com (بدون https و بدون مسیر).", 400);
  }
  return host;
}

/** دامنه باید آزاد باشد (یا مالکیت همین سالن باشد) — وگرنه ۴۰۹ */
export async function assertDomainFree(host: string, exceptSalonId: string) {
  const taken = await prisma.salon.findFirst({ where: { customDomain: host, id: { not: exceptSalonId } }, select: { id: true } });
  if (taken) throw httpError("این دامنه قبلاً برای سالن دیگری ثبت شده است.", 409);
}
