/**
 * ابزار آدرس عمومی هر سالن — تشخیص حالت ساب‌دامین و ساخت لینک دقیق صفحهٔ سالن.
 *
 * حالت‌ها:
 * ۱) روی localhost یا زیردامنه‌های آن (bahar.localhost:5173) — همیشه ساب‌دامین
 * ۲) روی دامنهٔ اصلی — اگر میزبان زیرِ ROOT_DOMAIN باشد حالت ساب‌دامین
 * ۳) مسیر /s/<slug> به‌عنوان بازگشتی مطمئن
 */

/** آدرس پایهٔ سایت (از SITE_URL یا APP_URL) */
function siteUrl(): string {
  const raw =
    process.env.SITE_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:5173";
  return raw.replace(/\/+$/, "");
}

function rootDomain(): string {
  return (process.env.ROOT_DOMAIN ?? "localhost").trim().toLowerCase();
}

/** برچسب DNS معتبر: فقط حرف/رقم/خط تیره و بدون نقطه در ابتدا/انتها */
function isDnsLabel(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(slug);
}

type OriginParts = { proto: string; hostname: string; port: string };

/** تجزیهٔ اوریجین یا میزبان (http://localhost:5173 یا localhost:5173) */
export function parseOrigin(origin: string): OriginParts | null {
  try {
    const url = /^https?:\/\//i.test(origin) ? new URL(origin) : new URL(`http://${origin}`);
    return { proto: url.protocol, hostname: url.hostname.toLowerCase(), port: url.port };
  } catch {
    return null;
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** آیا میزبان محلی است؟ (localhost یا *.localhost) */
function isLocalish(hostname: string): boolean {
  return isLocalHost(hostname) || hostname.endsWith(".localhost");
}

/** آیا میزبان در حالت ساب‌دامین است؟ */
export function subdomainMode(origin: string): boolean {
  const parts = parseOrigin(origin);
  if (!parts) return false;
  const { hostname } = parts;
  if (isLocalish(hostname)) return true;
  const root = rootDomain();
  if (root === "localhost") return false;
  return hostname === root || hostname.endsWith(`.${root}`);
}

/** آدرس دقیق صفحهٔ سالن بر پایهٔ اوریجین */
export function salonUrlFromOrigin(slug: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  const fallback = `${base}/s/${slug}`;
  const parts = parseOrigin(origin);
  if (!isDnsLabel(slug) || !parts || !subdomainMode(origin)) return fallback;
  const { proto, hostname, port } = parts;
  const portSuffix = port ? `:${port}` : "";
  if (isLocalish(hostname)) return `${proto}//${slug}.localhost${portSuffix}`;
  return `${proto}//${slug}.${rootDomain()}${portSuffix}`;
}

/** آدرس عمومی سالن (دامنهٔ اختصاصی تأییدشده یا ساب‌دامین/مسیر) */
export function salonPublicUrl(
  salon: { slug: string; customDomain?: string | null; domainStatus?: string | null },
  host?: string | null
): string {
  if (salon.customDomain && salon.domainStatus === "VERIFIED") {
    return `https://${salon.customDomain}`;
  }
  if (!host) return salonUrlFromOrigin(salon.slug, siteUrl());
  const bare = host.toLowerCase().replace(/:[0-9]+$/, "");
  const proto = isLocalHost(bare) || bare.endsWith(".localhost") ? guessLocalProto() : "https";
  return salonUrlFromOrigin(salon.slug, `${proto}://${host}`);
}

/** پروتکل محلی برای محیط توسعه */
function guessLocalProto(): string {
  return siteUrl().startsWith("https://") ? "https" : "http";
}

/** میزبان بدون پروتکل/مسیر/پورت */
function bareHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:[0-9]+$/, "");
}

/** آیا میزبان درخواست، دامنهٔ خودِ همین سالن است؟ */
export function isSalonOwnHost(
  salon: { slug: string; customDomain?: string | null; domainStatus?: string | null },
  host?: string | null
): boolean {
  const bare = bareHost(host ?? "");
  if (!bare) return false;
  if (salon.customDomain && salon.domainStatus === "VERIFIED" && bare === bareHost(salon.customDomain)) return true;
  const slug = (salon.slug ?? "").trim().toLowerCase();
  if (!slug) return false;
  if (bare === `${slug}.localhost`) return true;
  const root = rootDomain();
  return root !== "localhost" && bare === `${slug}.${root}`;
}

/** اوریجین کامل از هدرهای درخواست (host و x-forwarded-proto) */
export function requestOrigin(host?: string | null, forwardedProto?: string | null): string {
  if (!host) return siteUrl();
  const bare = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!bare) return siteUrl();
  const declared = (forwardedProto ?? "").split(",")[0].trim().replace(/:$/, "");
  const proto =
    declared === "https" || declared === "http"
      ? declared
      : isLocalish(bareHost(bare))
        ? guessLocalProto()
        : "https";
  return `${proto}://${bare}`;
}
