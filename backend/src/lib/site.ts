/**
 * آدرس عمومی سایت در یک نقطه — همه لینک‌های مطلق (sitemap، robots، JSON-LD و ...)
 * باید از این‌جا ساخته شوند تا با دامنه واقعی نصب هم‌خوان بمانند.
 *
 * اولویت: SITE_URL سپس APP_URL.
 */
const RAW_BASE =
  process.env.SITE_URL?.trim() ||
  process.env.APP_URL?.trim() ||
  "http://localhost:5173";

export const SITE_URL = RAW_BASE.replace(/\/+$/, "");

/** ساخت آدرس مطلق از یک مسیر نسبی */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** نمایش آدرس بدون پروتکل — برای متن‌های UI */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
