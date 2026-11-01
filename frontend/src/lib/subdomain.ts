/**
 * ابزار ساب‌دامین سالن (نسخهٔ SPA).
 *
 * در این پروژه روتینگ سمت کلاینت (react-router) انجام می‌شود؛ بنابراین تشخیص
 * ساب‌دامین و تصمیم‌گیری دربارهٔ هدایت، در مرورگر انجام می‌شود:
 *  - فرم مسیر:      https://nobino.ir/s/mah
 *  - فرم ساب‌دامین:  https://mah.nobino.ir  (در dev: mah.localhost:5175)
 *
 * هردو فرم باید صفحهٔ سالن را نشان دهند (بدون هدایت اجباری).
 *
 * دامنهٔ ریشه از `VITE_ROOT_DOMAIN` هنگام build خوانده می‌شود (هم‌نام با
 * ROOT_DOMAIN سمت سرور). اگر ست نشده باشد، از خودِ میزبان جاری استنتاج
 * می‌شود تا روی دامنه‌های تستی هم کار کند؛ در لوکال پیش‌فرض «localhost» است.
 */

/** دامنهٔ ریشهٔ build (.env → VITE_ROOT_DOMAIN) */
const BUILD_ROOT = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined)?.trim().toLowerCase() || "";

/** آیا میزبان، میزبان محلی (localhost/127.x/[::1]) است؟ */
function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
}

/** برچسب DNS معتبر: فقط حرف/رقم/خط تیره */
function isDnsLabel(label: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

/**
 * دامنهٔ ریشه در زمان اجرا.
 * ۱) VITE_ROOT_DOMAIN اگر ست شده باشد
 * ۲) در لوکال: localhost
 * ۳) در دامنهٔ واقعی: دو برچسب آخر میزبان (nobino.ir از mah.nobino.ir) — و اگر
 *    میزبان خودش فقط دو برچسب داشت، همان میزبان دامنهٔ ریشه است.
 */
export function rootDomain(): string {
  if (typeof window === "undefined") return BUILD_ROOT || "localhost";
  if (BUILD_ROOT) return BUILD_ROOT;
  const host = window.location.hostname.toLowerCase();
  if (isLocalHost(host)) return "localhost";
  return host.split(".").slice(-2).join(".");
}

/**
 * اگر میزبان جاری یک ساب‌دامین سالن باشد، اسلاگ آن را برمی‌گرداند؛
 * در غیر این صورت null.
 */
export function currentSalonSlug(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  const root = rootDomain();
  if (!root || host === root || isIpLike(host)) return null;
  const suffix = `.${root}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  // ساب‌دامین‌های خدماتی (www, api, panel) سالن نیستند
  if (!isDnsLabel(label) || label === "www" || !label) return null;
  return label;
}

/** آیا در حال حاضر روی یک ساب‌دامین سالن هستیم؟ */
export function isSalonSubdomain(): boolean {
  return currentSalonSlug() !== null;
}

/** آدرس‌های IP‌مانند (۱۲۷.۰.۰.۱، 192.168.1.5) ساب‌دامین ندارند */
function isIpLike(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/**
 * آدرس مطلق صفحهٔ عمومی سالن با فرم ساب‌دامین.
 * - لوکال: پورت حفظ می‌شود (mah.localhost:5175)
 * - پروداکشن: https روی دامنهٔ ریشه، بدون پورت
 * اگر همین حالا روی ساب‌دامین همان سالن باشیم، آدرس ریشه (/) برمی‌گردد تا
 * دو بار پیشوند نزند.
 */
export function subdomainUrl(slug: string): string {
  if (typeof window === "undefined") return `/s/${slug}`;
  const { protocol, hostname, port } = window.location;
  if (isIpLike(hostname)) return `${protocol}//${hostname}${port ? `:${port}` : ""}/s/${slug}`;
  const root = rootDomain();
  const already = hostname.toLowerCase() === `${slug.toLowerCase()}.${root}`;
  if (already) return `${protocol}//${hostname}${port ? `:${port}` : ""}/`;
  const portSuffix = root === "localhost" && port ? `:${port}` : "";
  return `${protocol}//${slug}.${root}${portSuffix}/`;
}

/** مسیر نسبی صفحهٔ سالن با فرم /s/<slug> */
export function pathUrl(slug: string): string {
  return `/s/${slug}`;
}
