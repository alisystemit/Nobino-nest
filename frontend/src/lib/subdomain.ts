/**
 * ابزار ساب‌دامین سالن (نسخهٔ SPA).
 *
 * در این پروژه روتینگ سمت کلاینت (react-router) انجام می‌شود؛ بنابراین تشخیص
 * ساب‌دامین و تصمیم‌گیری دربارهٔ هدایت، در مرورگر انجام می‌شود:
 *  - فرم مسیر:  http://localhost:5175/s/mah
 *  - فرم ساب‌دامین:  mah.localhost:5175
 *
 * هردو فرم باید صفحهٔ سالن را نشان دهند (بدون هدایت اجباری).
 */

/** دامنهٔ ریشه برای ساب‌دامین‌های لوکال (default در Vite) */
const LOCAL_ROOT = "localhost";

/** آیا میزبان، میزبان محلی (localhost/127.x/[::1]) است؟ */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

/**
 * اگر میزبان جاری یک ساب‌دامین سالن باشد، اسلاگ آن را برمی‌گرداند؛
 * در غیر این صورت null.
 */
export function currentSalonSlug(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  // مثل «mah.localhost»، «bahar.localhost»
  const re = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)\.localhost$/;
  if (host !== LOCAL_ROOT && !isLocalHost(host)) {
    const m = re.exec(host);
    if (m) return m[1];
  }
  return null;
}

/** آیا در حال حاضر روی یک ساب‌دامین سالن هستیم؟ */
export function isSalonSubdomain(): boolean {
  return currentSalonSlug() !== null;
}

/**
 * آدرس مطلق صفحهٔ عمومی سالن با فرم ساب‌دامین، روی اوریج جاری.
 * اگر اوریج لوکال باشد: mah.localhost:5175 (پورت حفظ می‌شود).
 */
export function subdomainUrl(slug: string): string {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : "";
  return `${protocol}//${slug}.${LOCAL_ROOT}${portSuffix}`;
}

/** مسیر نسبی صفحهٔ سالن با فرم /s/<slug> */
export function pathUrl(slug: string): string {
  return `/s/${slug}`;
}
