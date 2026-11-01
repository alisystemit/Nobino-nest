/**
 * ابزارهای خالص برای «یک روز» در صفحهٔ نوبت‌ها — بدون وابستگی به Prisma یا کوکی
 * تا هم در Server Component و هم با `node --test` قابل استفاده/تست باشد.
 *
 * مبنای همهٔ روزها منطقهٔ زمانی خودِ سالن است (`Salon.timezone`): یک نوبت ۲۳:۵۰
 * وال‌کلوک تهران باید در «همان روز» دیده شود، حتی اگر مرورگر کاربر در منطقهٔ
 * زمانی دیگری باشد.
 */

import { localMidnightUTC } from "../timezone.ts";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** پارام تاریخ از URL؛ هر ورودی نامعتبر (یا نبود) به روز مرجع برمی‌گردد */
export function parseDayParam(raw: string | null | undefined, fallbackDay: string): string {
  return raw && DAY_RE.test(raw) ? raw : fallbackDay;
}

/** جابه‌جایی `days` روز روی YYYY-MM-DD (شماری محض تقویمی، بدون ساعت) */
export function shiftDay(dayISO: string, days: number): string {
  const d = new Date(`${dayISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** پنجرهٔ یک روز به وقت محلی `timeZone`: [نیمه‌شب امروز، نیمه‌شب فردا) */
export function dayWindow(dayISO: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: localMidnightUTC(dayISO, timeZone),
    end: localMidnightUTC(shiftDay(dayISO, 1), timeZone),
  };
}

/** تعداد روزهای `day` نسبت به `base` (مثبت = آینده) — برای برچسب دیروز/فردا */
export function dayDiff(day: string, base: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000);
}

/** برچسب فارسی روز؛ `baseISO` همان «امروز» به وقت سالن است */
export function dayLabel(day: string, baseISO: string, formatFull: (day: string) => string): string {
  const diff = dayDiff(day, baseISO);
  if (diff === 0) return "امروز";
  if (diff === 1) return "فردا";
  if (diff === -1) return "دیروز";
  return formatFull(day);
}
