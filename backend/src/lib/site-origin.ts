/**
 * اوریجین عمومی سایت — تنها منبع حقیقت برای ساخت آدرس مطلق.
 *
 * اولویت: SITE_URL → APP_URL → ساختن از ROOT_DOMAIN.
 * در production پیش‌فرضِ `localhost` هرگز مجاز نیست؛ اگر نه SITE_URL و نه
 * ROOT_DOMAIN تنظیم شده باشد، بوت با پیام روشن می‌سوزد تا sitemap،
 * لینک پیامک و JSON-LD به آدرس لوکال نروند.
 */

const LOCAL_FALLBACK = "http://localhost:5175";

function isProduction(): boolean {
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
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
