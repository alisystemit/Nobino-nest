/**
 * تشخیص «ساب‌دامین سالن» داخل ماژول مینی‌اپ.
 *
 * مینی‌اپ خودمختار است و نباید کد سایت (`@/lib/subdomain`) را import کند، برای همین
 * همین منطق ساده‌شده اینجا نگه داشته می‌شود. هدف: وقتی کاربر مینی‌اپ را از نشانی
 * خودش یک سالن باز می‌کند (مثلاً `mah.localhost:5175/mini` یا `mah.nobino.ir/mini`)
 * بفهمیم آن سالن کدام است.
 *
 * دامنهٔ ریشه:
 *   ۱) `VITE_ROOT_DOMAIN` اگر ست شده باشد (هم‌نام با ROOT_DOMAIN سمت سرور)
 *   ۲) در لوکال: `localhost`
 *   ۳) روی دامنهٔ واقعی: دو برچسب آخر میزبان (`nobino.ir` از `mah.nobino.ir`)
 */

/** دامنهٔ ریشهٔ build، اگر از بیرون ست شده باشد */
const BUILD_ROOT = (import.meta.env.VITE_ROOT_DOMAIN as string | undefined)?.trim().toLowerCase() || "";

/** برچسب DNS معتبر: فقط حرف/رقم/خط تیره */
function isDnsLabel(label: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
}

/** آدرس‌های IP‌مانند (۱۲۷.۰.۰.۱، 192.168.1.5، میزبان‌های IPv6) ساب‌دامین سالن ندارند */
function isIpLike(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

/** برچسب‌های خدماتی که هیچ‌وقت سالن نیستند */
const RESERVED = new Set([
  "www", "api", "panel", "admin", "app", "m", "mini", "s", "cdn", "static", "assets", "uploads",
  "files", "mail", "smtp", "webmail", "blog", "docs", "help", "support", "status", "test", "dev", "staging",
]);

/** دامنهٔ ریشه در زمان اجرا */
export function miniRootDomain(): string {
  if (typeof window === "undefined") return BUILD_ROOT || "localhost";
  if (BUILD_ROOT) return BUILD_ROOT;
  const host = window.location.hostname.toLowerCase();
  if (isLocalHost(host)) return "localhost";
  return host.split(".").slice(-2).join(".");
}

/**
 * اسلاگ سالنِ ساب‌دامین جاری، یا رشتهٔ خالی اگر روی ساب‌دامین سالن نیستیم.
 * (`mah.localhost:5175` → "mah" · `localhost:5175` → "" · `www.nobino.ir` → "")
 */
export function miniHostSlug(): string {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname.toLowerCase();
  if (isIpLike(host)) return "";
  const root = miniRootDomain();
  if (!root || host === root) return "";
  const suffix = `.${root}`;
  if (!host.endsWith(suffix)) return "";
  const label = host.slice(0, -suffix.length);
  // ساب‌دامین چندتایی (a.b.nobino.ir) سالن نیست
  if (!isDnsLabel(label) || label.includes(".")) return "";
  if (RESERVED.has(label)) return "";
  return label;
}

/** آیا مینی‌اپ همین حالا روی نشانی یک سالن باز است؟ */
export function miniIsSalonHost(): boolean {
  return miniHostSlug() !== "";
}
