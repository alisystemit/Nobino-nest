/**
 * کاتالوگ ماژول‌های پکیج‌ها (SaaS).
 *
 * پکیج‌ها دیگر «متن آزاد» نمی‌چینند؛ هر ماژول یک کلید واقعی دارد که تا جایی که
 * امکان دارد به همان محدودیت/امکان اعمال‌شده در `plans/limits.ts` وصل است.
 * نتیجه: اگر سوپرادمین سقف کارمند پلن PRO را عوض کند، برچسب نمایش‌داده‌شده در
 * صفحه پکیج‌ها هم خودبه‌خود عوض می‌شود.
 *
 * این فایل عمداً بدون وابستگی سمت سرور نوشته شده تا هم در API و هم در کامپوننت
 * کلاینت (پنل ادمین) قابل import باشد.
 */
import { UNLIMITED_FROM } from "./limit-defs.ts";
import type { PlanLimits } from "./limits-data.ts";

/** تبدیل رقم به فارسی — اینجا محلی است تا کاتالوگ بدون وابستگی، در تست و کلاینت هم کار کند */
function fa(input: string | number): string {
  return String(input).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** ورودی ذخیره‌شده در `Package.features` — سازگار با رشته‌های قدیمی */
export type FeatureRef = { key: string; value?: number | null };
export type StoredFeature = string | FeatureRef;

export type ModuleDef = {
  key: string;
  /** نام کوتاه ماژول برای انتخاب‌گر پنل */
  label: string;
  /** bool = امکان روشن/خاموش؛ count = سقف عددی */
  kind: "bool" | "count";
  /** کلید متناظر در PlanLimits (اگر این ماژول واقعاً در سامانه اعمال می‌شود) */
  limitKey?: keyof PlanLimits;
  icon: string;
  hint?: string;
};

/** سقف «نامحدود» — یک آستانهٔ مشترک با کاتالوگ محدودیت‌ها */
export { UNLIMITED_FROM };

export const MODULES: ModuleDef[] = [
  { key: "booking", label: "نوبت‌دهی آنلاین", kind: "bool", icon: "📅", hint: "تقویم، نوبت‌های امروز و لغو نوبت" },
  { key: "staff", label: "کارکنان", kind: "count", limitKey: "staff", icon: "👥" },
  { key: "branches", label: "شعبه", kind: "count", limitKey: "branches", icon: "🏬" },
  { key: "services", label: "خدمات", kind: "count", limitKey: "services", icon: "✂️" },
  { key: "customers", label: "مشتریان CRM", kind: "count", limitKey: "customers", icon: "📇" },
  { key: "smsQuota", label: "پیامک ماهانه", kind: "count", limitKey: "smsPerMonth", icon: "📩" },
  { key: "salons", label: "سالن برای هر کاربر", kind: "count", limitKey: "salons", icon: "🏪" },
  { key: "voiceBooking", label: "نوبت صوتی با هوش مصنوعی", kind: "bool", limitKey: "voiceBooking", icon: "🎙️" },
  { key: "smsReminders", label: "پیامک یادآوری خودکار", kind: "bool", limitKey: "smsReminders", icon: "💬" },
  { key: "webapp", label: "وب‌اپ نصب‌شدنی (PWA)", kind: "bool", limitKey: "webapp", icon: "📲" },
  { key: "csvExport", label: "خروجی اکسل و گزارش", kind: "bool", limitKey: "csvExport", icon: "📊" },
  { key: "customDomain", label: "دامنه اختصاصی سالن", kind: "bool", limitKey: "customDomain", icon: "🌐" },
  { key: "api", label: "وب‌هوک و API", kind: "bool", limitKey: "api", icon: "🔌" },
  { key: "gallery", label: "گالری نمونه‌کار", kind: "bool", icon: "🖼️" },
  { key: "reviews", label: "نظرات و امتیاز مشتریان", kind: "bool", icon: "⭐" },
  { key: "campaigns", label: "کمپین پیامکی در ماه", kind: "count", limitKey: "campaigns", icon: "📣" },
  { key: "waitlist", label: "لیست انتظار نوبت", kind: "bool", icon: "⏳" },
  { key: "wallet", label: "کیف پول و کمیسیون", kind: "bool", icon: "💰" },
  { key: "invoices", label: "فاکتور آنلاین مشتری", kind: "bool", icon: "🧾" },
  { key: "loyalty", label: "امتیاز وفاداری و کد تخفیف", kind: "bool", icon: "🎁" },
  { key: "support", label: "پشتیبانی اختصاصی", kind: "bool", icon: "🛟" },
];

const BY_KEY = new Map(MODULES.map((m) => [m.key, m]));

export function findModule(key: string): ModuleDef | undefined {
  return BY_KEY.get(key);
}

function pluralCount(n: number, word: string): string {
  return n >= UNLIMITED_FROM ? `${word} نامحدود` : `تا ${fa(n.toLocaleString("en-US"))} ${word}`;
}

/**
 * برچسب نهایی یک ماژول.
 * `limits` مقدار محدودیت پلن مربوطه است؛ اگر ندهید، عدد ذخیره‌شده در پکیج
 * (یا هیچ) خوانده می‌شود.
 */
export function moduleLabel(feature: StoredFeature, limits?: Partial<PlanLimits>): string {
  if (typeof feature === "string") return feature; // ماژول دلخواه/قدیمی
  const def = BY_KEY.get(feature.key);
  if (!def) return feature.key;

  if (def.kind === "count") {
    const live = def.limitKey ? limits?.[def.limitKey] : undefined;
    const n = typeof live === "number" ? live : typeof feature.value === "number" ? feature.value : undefined;
    if (n == null) return def.label;
    return pluralCount(n, def.label);
  }
  return def.label;
}

export function moduleIcon(feature: StoredFeature): string {
  if (typeof feature === "string") return "✓";
  return BY_KEY.get(feature.key)?.icon ?? "✓";
}

/** آیا این ماژول در پلن داده‌شده فعال است؟ (ماژول‌های بدون limitKey همیشه فعال‌اند) */
export function moduleEnabled(feature: StoredFeature, limits?: Partial<PlanLimits>): boolean {
  if (typeof feature === "string") return true;
  const def = BY_KEY.get(feature.key);
  if (!def || def.kind !== "bool" || !def.limitKey) return true;
  return limits?.[def.limitKey] !== false;
}

/** نرمال‌سازی ورودی نامعتبر دیتابیس (Json دلخواه) به آرایهٔ ماژول */
export function normalizeFeatures(raw: unknown): StoredFeature[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredFeature[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const text = item.trim();
      if (text) out.push(text);
    } else if (item && typeof item === "object") {
      const key = (item as { key?: unknown }).key;
      const value = (item as { value?: unknown }).value;
      if (typeof key === "string" && key.trim()) {
        out.push({ key: key.trim(), value: typeof value === "number" ? value : null });
      }
    }
  }
  return out;
}

/** فهرست پیش‌فرض یک پلن — وقتی پکیج ماژولی ندارد، صفحه خالی نمی‌ماند */
export function defaultFeatures(limits?: Partial<PlanLimits>): StoredFeature[] {
  return MODULES.filter((m) => !m.limitKey || limits?.[m.limitKey] !== false).map((m) =>
    m.kind === "count" ? { key: m.key, value: null } : { key: m.key }
  );
}

export type ResolvedFeature = { key: string | null; label: string; icon: string };

/** تبدیل ماژول‌های ذخیره‌شده به چیزی که مشتری می‌بیند */
export function resolveFeatures(raw: unknown, limits?: Partial<PlanLimits>): ResolvedFeature[] {
  const list = normalizeFeatures(raw);
  const source = list.length ? list : defaultFeatures(limits);
  return source
    .filter((f) => moduleEnabled(f, limits))
    .map((f) => ({
      key: typeof f === "string" ? null : f.key,
      label: moduleLabel(f, limits),
      icon: moduleIcon(f),
    }));
}
