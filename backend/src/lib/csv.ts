/**
 * ساخت فایل CSV با محافظت در برابر «فرمول‌تزریق» (CSV injection).
 *
 * چرا لازم بود: خروجی نوبت‌ها فقط نقل‌قول می‌زد و متن مشتری را عیناً می‌گذاشت.
 * اگر نام مشتری `+9999999999999999` یا `=HYPERLINK(...)` باشد، Excel آن را «متن»
 * نمی‌خواند بلکه آن را اجرا می‌کند — یعنی فایل دانلودشدهٔ سالن‌دار می‌تواند
 * دستور اجرا یا لینک جعلی باز کند. راه‌حل استاندارد: پیشوند `'` برای سلول‌هایی
 * که با `= + - @ TAB CR` شروع می‌شوند.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

/** خنثی‌سازی فرمول + نقل‌قول CSV برای یک سلول */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" || typeof value === "boolean") return `"${value}"`;
  let s = String(value);
  // کاراکترهای کنترلی (خط جدید/تب) چیدمان فایل را می‌شکنند → به فاصله تبدیل می‌شوند
  s = s.replace(/[\r\n\t]+/g, " ");
  if (FORMULA_START.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

/** فایل CSV کامل با BOM (برای تشخیص درست فارسی در Excel) */
export function csvFile(header: unknown[], rows: unknown[][]): string {
  return "\uFEFF" + [csvRow(header), ...rows.map(csvRow)].join("\r\n");
}
