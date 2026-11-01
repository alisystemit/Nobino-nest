import type { ExtractedAppointment } from "./parser";

/**
 * ادغام نتایج استخراج گفتار.
 *
 * یک نوبت ممکن است در چند برش ساخته شود: جملهٔ اصلی، بعد فقط «ساعت»، بعد یک
 * فایل صوتی کوتاه. این تابع مقادیر تازه را روی نتیجهٔ قبلی می‌نشاند، با دو قاعده:
 * ۱) مقدار `undefined`/`null`/رشتهٔ خالی، فیلد قبلی را پاک نمی‌کند؛
 * ۲) فقط کلیدهای موجود در patch جایگزین می‌شوند (بقیه دست‌نخورده می‌مانند).
 *
 * این ماژول عمداً هیچ وابستگی زمان‌اجرا ندارد تا با `node --test` قابل تست باشد.
 */
export function mergeExtracted(
  base: Partial<ExtractedAppointment>,
  patch: Partial<ExtractedAppointment>
): Partial<ExtractedAppointment> {
  const out: Partial<ExtractedAppointment> = { ...base };
  for (const [key, value] of Object.entries(patch) as [keyof ExtractedAppointment, unknown][]) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    out[key] = value as never;
  }
  return out;
}
