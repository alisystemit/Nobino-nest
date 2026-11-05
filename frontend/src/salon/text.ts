/**
 * یک‌دست‌سازی رقم‌ها در متن‌های فارسیِ صفحهٔ عمومی سالن.
 *
 * مشکل: فونت Yekan (که کل صفحه با آن ست می‌شود) هیچ رقم و حرف لاتینی ندارد.
 * نام‌هایی که مستقیم از دیتابیس می‌آیند مثل «لمینت مژه 2-1» یا «شعبه 2» داخل
 * یک خط دو فونت می‌سازند: بخش فارسی با Yekan و «2-1» با Vazirmatn با وزن مصنوعی؛
 * قد و ضخامت نمی‌خواند و چون رقم لاتین (EN) کنار رقم فارسی (AN) می‌نشیند،
 * ترتیب نمایش (bidi) کل خط جابه‌جا می‌شود.
 *
 * راه‌حل: همین‌جا — در مرز داده، دقیقاً قبل از رندر — رقم‌های بخش فارسی به
 * رقم فارسی تبدیل می‌شوند تا کل رشته با یک فونت ست شود. فقط فیلدهای
 * «نمایشی» دست می‌خورند؛ کلید/شناسه/slug/پیوند/شماره/ساعت و دادهٔ ساختاریافته
 * (jsonLd، meta) دست‌نخورده می‌مانند تا هیچ منطقی نشکند.
 */
import { faText } from "@/mini/lib/format";

/** رشته‌های صرفاً نمایشی */
const TEXT_KEYS = new Set(["name", "title", "description", "label", "comment", "address", "city", "bio", "text"]);
/** رشته‌های نمایشیِ داخل آرایه (مثل تخصص‌های آرایشگر) */
const ARRAY_TEXT_KEYS = new Set(["specialties"]);
/** ورودی‌هایی که اصلاً باز نمی‌شوند: دادهٔ سئو و فیلدهای فنی */
const SKIP_KEYS = new Set(["jsonLd", "meta", "@context", "@type", "@id", "@graph", "url", "image", "sameAs"]);

function walk(value: unknown, key: string | undefined): unknown {
  if (typeof value === "string") return (key && (TEXT_KEYS.has(key) || ARRAY_TEXT_KEYS.has(key))) ? faText(value) : value;
  if (Array.isArray(value)) return value.map((item) => walk(item, key));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SKIP_KEYS.has(k) ? v : walk(v, k);
    return out;
  }
  return value;
}

/** کپیِ بی‌خطرِ دادهٔ بارگذاری‌شده، با رقم‌های فارسی در فیلدهای نمایشی */
export function localizeTexts<T>(value: T): T {
  return walk(value, undefined) as T;
}
