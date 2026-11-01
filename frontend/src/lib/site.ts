/**
 * آدرس عمومی سایت در نسخهٔ SPA.
 * در build مقدار VITE_SITE_URL (یا VITE_APP_URL) جای‌گذاری می‌شود؛ اگر تنظیم
 * نشده باشد مبنا آدرس خودِ مرورگر است.
 */
const RAW_BASE: string =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() ||
  (import.meta.env.VITE_APP_URL as string | undefined)?.trim() ||
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export const SITE_URL = RAW_BASE.replace(/\/+$/, "");

/** ساخت آدرس مطلق از یک مسیر نسبی */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** نمایش آدرس بدون پروتکل — برای متن‌های UI */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
