/**
 * توابع منطقه‌زمانی بدون وابستگی به Prisma/کوکی‌ها تا در تست واحد هم قابل استفاده باشد.
 */

export function tzOffsetMinutes(timeZone: string, date: Date): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone });
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000;
}

/**
 * اجزای تاریخ/ساعت یک لحظه در منطقه‌زمان دلخواه:
 * روز محلی (YYYY-MM-DD) و دقیقه از نیمه‌شب + ثانیه.
 */
export function localParts(date: Date, timeZone: string): { dayISO: string; minutes: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const hour = Number(pick("hour")) % 24;
  const minute = Number(pick("minute"));
  const second = Number(pick("second"));
  return {
    dayISO: `${pick("year")}-${pick("month")}-${pick("day")}`,
    minutes: hour * 60 + minute,
    second,
  };
}

/** تبدیل نیمه‌شب محلی یک تاریخ میلادی (YYYY-MM-DD) در منطقه‌زمان دلخواه به UTC */
export function localMidnightUTC(dayISO: string, timeZone: string): Date {
  const [y, mo, d] = dayISO.split("-").map(Number);
  const year = y ?? 1970;
  const month = (mo ?? 1) - 1;
  const day = d ?? 1;
  const approx = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const offset = tzOffsetMinutes(timeZone, approx);
  return new Date(Date.UTC(year, month, day, 0, 0, 0) - offset * 60 * 1000);
}
