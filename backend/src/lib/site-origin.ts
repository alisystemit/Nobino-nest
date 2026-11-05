/**
 * اوریجین عمومی سایت — تنها منبع حقیقت برای ساخت آدرس مطلق.
 *
 * اولویت: SITE_URL → APP_URL → ساختن از ROOT_DOMAIN.
 * در production پیش‌فرضِ `localhost` هرگز مجاز نیست؛ اگر نه SITE_URL و نه
 * ROOT_DOMAIN تنظیم شده باشد، بوت با پیام روشن می‌سوزد تا sitemap،
 * لینک پیامک و JSON-LD به آدرس لوکال نروند.
 *
 * برای لینک‌هایی که «همین حالا» به کاربر نشان داده می‌شود (پنل ادمین، کانفیگ
 * مینی‌اپ، کیو‌آر) `publicOrigin()` هست: اوریجینِ میزبانِ درخواست جاری، با
 * حفظ پورت — تا روی `http://mah.localhost:3100` نشانی‌ها `:3100` بگیرند و روی
 * `:5175` همان `:5175`. بیرون از درخواست (کران/پیامک/بیلد) همان SITE_URL.
 */
import { requestStore } from "@/compat/request-context";

const LOCAL_FALLBACK = "http://localhost:5175";

function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

/** میزبان محلی؟ (localhost، *.localhost، 127.x، [::1]، ::1) */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    /^127\.\d+\.\d+\.\d+$/.test(hostname)
  );
}

/** ROOT_DOMAIN بدون پروتکل/مسیر/پورت؛ خالی اگر تنظیم نشده یا لوکال باشد */
function configuredRoot(): string {
  return (process.env.ROOT_DOMAIN ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:[0-9]+$/, "");
}

/**
 * اوریجینِ درخواست جاری (پروتکل + میزبان + پورت) یا null.
 * دو حالت پذیرفته می‌شود و بقیه رد:
 *  ۱) میزبان محلی — در توسعه لازم است تا پورت (`:3100` یا `:5175`) حفظ شود؛
 *  ۲) میزبان زیرِ ROOT_DOMAIN — یعنی همان دامنهٔ نصب‌شده.
 * میزبان جعلی/متفرقهٔ هدر Host رد می‌شود (Host-header injection) و caller به
 * SITE_URLِ تنظیم‌شده برمی‌گردد. بیرون از HTTP request (کران، پیامک، پری‌رندرِ
 * داخلی روی 127.0.0.1) هم null است.
 */
export function requestOriginOrNull(): string | null {
  const ctx = requestStore.getStore();
  if (!ctx) return null;
  let url: URL;
  try {
    url = new URL(ctx.request.url);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hostname = url.hostname.toLowerCase();
  if (isLocalHost(hostname)) return url.origin;
  const root = configuredRoot();
  if (!root || root === "localhost") return null;
  return hostname === root || hostname.endsWith(`.${root}`) ? url.origin : null;
}

/** اوریجین لینک‌های نمایشی/قابل‌کپی: میزبان درخواست، وگرنه SITE_URL */
export function publicOrigin(): string {
  return requestOriginOrNull() ?? siteOriginSafe();
}

/** ROOT_DOMAIN (مثلاً `nobino.ir` یا `api-blog-shop.ir:8443`) → اوریجین https */
function originFromRootDomain(): string | null {
  const raw = (process.env.ROOT_DOMAIN ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!raw || raw === "localhost" || raw.endsWith(".localhost")) return null;
  return `https://${raw}`;
}

export function siteOrigin(): string {
  const configured = process.env.SITE_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const derived = originFromRootDomain();
  if (derived) return derived;
  if (isProduction()) {
    throw new Error(
      "SITE_URL (یا ROOT_DOMAIN) در محیط production تنظیم نشده است؛ " +
        "برای جلوگیری از ساخت لینک‌های localhost در sitemap/پیامک، آن را در .env بگذارید."
    );
  }
  return LOCAL_FALLBACK;
}

/** نسخهٔ بی‌خطر برای جاهایی که کرش کردن مجاز نیست */
export function siteOriginSafe(): string {
  try {
    return siteOrigin();
  } catch {
    return LOCAL_FALLBACK;
  }
}
