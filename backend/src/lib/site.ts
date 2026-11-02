/**
 * آدرس عمومی سایت در یک نقطه — همه لینک‌های مطلق (sitemap، robots، JSON-LD و ...)
 * باید از این‌جا ساخته شوند تا با دامنه واقعی نصب هم‌خوان بمانند.
 *
 * منطق انتخاب اوریجین در `lib/site-origin.ts` است (SITE_URL → APP_URL → ROOT_DOMAIN).
 */
import { siteOriginSafe } from "@/lib/site-origin";

export const SITE_URL = siteOriginSafe();

/** ساخت آدرس مطلق از یک مسیر نسبی */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** نمایش آدرس بدون پروتکل — برای متن‌های UI */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
