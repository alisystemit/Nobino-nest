/**
 * نشانیِ صفحات اصلی سایت، از هر جا (خانگی یا ساب‌دامین سالن).
 *
 * روی ساب‌دامین، روتر فقط صفحهٔ همان سالن را نشان می‌دهد (هر مسیر دیگری هم
 * همان صفحه را می‌دهد)، پس لینک نسبی مثل `/dashboard/appointments` به بن‌بست
 * می‌خورد. این helper در آن حالت آدرس مطلق دامنهٔ ریشه می‌سازد — با حفظ پورت
 * در لوکال (localhost:5175) و بدون پورت در پروداکشن.
 */
import { currentSalonSlug, rootDomain } from "@/lib/subdomain";

export function siteHref(path = "/"): string {
  if (typeof window === "undefined") return path.startsWith("/") ? path : `/${path}`;
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (!currentSalonSlug()) return clean;
  const { protocol, port } = window.location;
  const root = rootDomain();
  const host = root === "localhost" && port ? `${root}:${port}` : root;
  return `${protocol}//${host}${clean}`;
}

/** خانهٔ سایت */
export function siteHomeHref(): string {
  return siteHref("/");
}
