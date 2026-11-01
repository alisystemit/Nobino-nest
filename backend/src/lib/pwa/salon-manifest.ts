/**
 * سازندهٔ «مانیفست اختصاصی» هر سالن (PWA).
 *
 * چرا مانیفست جدا؟ فایل ثابت `/manifest.webmanifest` یک `start_url` سراسری دارد (`/`)؛
 * اگر مشتری اپ را از صفحهٔ سالن نصب کند، برنامهٔ نصب‌شدهٔ همهٔ سالن‌ها یک چیز می‌شود.
 * این ماژول برای هر سالن یک مانیفست می‌سازد تا:
 *  - `id`/`name`/`short_name` نام خودِ سالن باشد (دو سالن = دو اپ جدا)
 *  - `start_url` دقیقاً همان صفحهٔ اختصاصی سالن باشد
 */

export type ManifestMode = "ownOrigin" | "path";

export type SalonManifestInput = {
  slug: string;
  name: string;
  description?: string | null;
  city?: string | null;
  /** رنگ جلد سالن؛ فقط رنگ hex معتبر پذیرفته می‌شود */
  coverColor?: string | null;
  /** آیا میزبان درخواست، دامنهٔ خودِ سالن است؟ */
  mode: ManifestMode;
};

/** نشانه‌های مشترک همهٔ نسخه‌ها */
const ICONS = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

const FALLBACK_THEME = "#ec4899";
const FALLBACK_BG = "#fafafa";

/** مسیر روت مانیفست داینامیک */
export function salonManifestHref(slug: string): string {
  return `/api/pwa/manifest/${encodeURIComponent(slug)}`;
}

/** `start_url`/`scope`/`id` بر پایهٔ حالت میزبان */
export function salonAppPaths(slug: string, mode: ManifestMode): { startUrl: string; scope: string; id: string } {
  const p = mode === "ownOrigin" ? "/" : `/s/${slug}`;
  return { startUrl: p, scope: p, id: p };
}

/** فقط رنگ hex معتبر */
export function safeHexColor(value: string | null | undefined, fallback = FALLBACK_THEME): string {
  const v = (value ?? "").trim();
  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : fallback;
}

/** برش نرم برای نام‌های بلند */
function trim(value: string, max: number): string {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length > max ? `${v.slice(0, Math.max(1, max - 1))}…` : v;
}

export function buildSalonManifest(input: SalonManifestInput): Record<string, unknown> {
  const slug = input.slug.trim();
  const name = trim(input.name || "سالن زیبایی", 48);
  const { startUrl, scope, id } = salonAppPaths(slug, input.mode);
  const where = input.city?.trim() ? ` در ${trim(input.city.trim(), 24)}` : "";

  return {
    id,
    name: `${name} — رزرو نوبت آنلاین`,
    short_name: trim(name, 14),
    description:
      trim(input.description ?? "", 160) ||
      `رزرو نوبت ${name}${where}؛ مشاهدهٔ خدمات، قیمت‌ها، آرایشگران و زمان‌های آزاد.`,
    start_url: startUrl,
    scope,
    display: "standalone",
    orientation: "any",
    dir: "rtl",
    lang: "fa",
    background_color: FALLBACK_BG,
    theme_color: safeHexColor(input.coverColor),
    categories: ["lifestyle", "business"],
    icons: ICONS,
  };
}
