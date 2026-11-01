/**
 * آدرس عمومی سایت در یک نقطه — همه لینک‌های مطلق (sitemap، robots، JSON-LD و ...)
 * باید از این‌جا ساخته شوند تا با دامنه واقعی نصب هم‌خوان بمانند.
 *
 * اولویت: NEXT_PUBLIC_SITE_URL سپس NEXT_PUBLIC_APP_URL.
 * هر دو متغیر در زمان build داخل خروجی قرار می‌گیرند؛ پس بعد از تغییرشان باید دوباره build شود.
 */
const RAW_BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "http://localhost:3000";

export const SITE_URL = RAW_BASE.replace(/\/+$/, "");

/** ساخت آدرس مطلق از یک مسیر نسبی */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** نمایش آدرس بدون پروتکل — برای متن‌های UI */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
