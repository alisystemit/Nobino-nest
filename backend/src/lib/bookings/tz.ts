/** ابزارهای منطقه زمانی (خالص، بدون وابستگی به Prisma) — قابل تست واحد */

function tzOffsetMinutes(timeZone: string, date: Date): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const tzStr = date.toLocaleString("en-US", { timeZone });
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 60000;
}

/** تبدیل نیمه‌شب محلی یک روز (YYYY-MM-DD) به لحظه UTC */
export function localMidnightUTC(dayISO: string, timeZone: string): Date {
  const [y, mo, d] = dayISO.split("-").map(Number);
  const approx = new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1, 12, 0, 0));
  const offset = tzOffsetMinutes(timeZone, approx);
  return new Date(Date.UTC(y, (mo ?? 1) - 1, d ?? 1, 0, 0, 0) - offset * 60 * 1000);
}
