/**
 * کاتالوگ محدودیت‌های پلن‌ها (SaaS).
 *
 * هر محدودیت فقط «یک بار» اینجا تعریف می‌شود: کلید، نام فارسی، واحد، نوع (سقف عددی
 * یا روشن/خاموش)، دامنهٔ شمارش (سالن یا مالک) و اینکه آیا در بازهٔ ماهانه شمرده
 * می‌شود.
 *
 * نتیجه: افزودن یک لیمیت جدید = یک سطر در این فایل + یک مقدار در پیش‌فرض پلن‌ها.
 * ماتریس پنل سوپرادمین، بررسی سقف در API و برچسب صفحهٔ پکیج‌ها همه از همین
 * کاتالوگ ساخته می‌شوند؛ هیچ عددی در کامپوننت‌ها hard-code نشده است.
 *
 * این فایل عمداً فقط `import type` دارد تا در کامپوننت کلاینت، مسیر API و
 * `node --test` (بدون resolve شدن `@/`) قابل استفاده بماند.
 */
import type { PlanLimits } from "./limits-data.ts";

/** رقم لاتین → فارسی (محلی، برای همان دلیلِ بدون‌وابستگی) */
export function faDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export type LimitKind = "count" | "bool";
/** salon = به ازای هر سالن شمرده می‌شود · owner = به ازای هر کاربر (مالک) */
export type LimitScope = "salon" | "owner";

export type LimitDef = {
  key: keyof PlanLimits;
  /** نام کامل برای سرستون ردیف پنل */
  label: string;
  /** واحد شمارش در برچسب («تا ۲۰ خدمت») */
  unit: string;
  kind: LimitKind;
  scope: LimitScope;
  /** آیا شمارش در بازهٔ ماه جاری انجام می‌شود (نه مجموع کل) */
  monthly?: boolean;
  icon: string;
  /** این سقف کجا اعمال می‌شود — در پنل به‌عنوان راهنما نمایش داده می‌شود */
  hint: string;
  /**
   * سقف پیشنهادی ورودی در فرم پنل. مقدار واقعی که پنل و اعتبارسنجی سرور می‌بینند
   * `entryCeiling()` در `limits-data.ts` است (همیشه ≥ آستانهٔ «نامحدود»).
   */
  max: number;
};

/**
 * آستانهٔ «نامحدود» در نمایش. سقف‌های واقعی پلن‌ها (مثل ۶۰۰۰ پیامک PRO) باید کمتر
 * از این باشند؛ مقادیر ۱۰۰۰۰۰ و بالاتر فقط به‌عنوان علامت بی‌سقفی در پلن سازمانی
 * به کار می‌روند.
 */
export const UNLIMITED_FROM = 100_000;

export const LIMIT_DEFS: LimitDef[] = [
  // ─── سقف‌های عددی سطح سالن ────────────────────────────────────────────
  {
    key: "staff",
    label: "تعداد کارکنان",
    unit: "کارمند",
    kind: "count",
    scope: "salon",
    icon: "👥",
    hint: "افزودن کارمند در بخش کارکنان داشبورد",
    max: 10000,
  },  {
    key: "branches",
    label: "تعداد شعبه",
    unit: "شعبه",
    kind: "count",
    scope: "salon",
    icon: "🏬",
    hint: "افزودن شعبه در بخش شعب داشبورد",
    max: 10000,
  },
  {
    key: "services",
    label: "تعداد خدمات",
    unit: "خدمت",
    kind: "count",
    scope: "salon",
    icon: "✂️",
    hint: "افزودن خدمت در بخش خدمات داشبورد",
    max: 100000,
  },
  {
    key: "galleryItems",
    label: "تصاویر گالری",
    unit: "تصویر",
    kind: "count",
    scope: "salon",
    icon: "🖼️",
    hint: "بارگذاری نمونه‌کار در بخش گالری",
    max: 100000,
  },
  {
    key: "customers",
    label: "مشتریان ثبت‌شده (CRM)",
    unit: "مشتری",
    kind: "count",
    scope: "salon",
    icon: "📇",
    hint: "ثبت دستی، ایمپورت اکسل و خودکار از نوبت",
    max: 1000000,
  },
  {
    key: "campaigns",
    label: "کمپین پیامکی در ماه",
    unit: "کمپین",
    kind: "count",
    scope: "salon",
    monthly: true,
    icon: "📣",
    hint: "ساخت کمپین در بخش کمپین‌ها (از ابتدای ماه شمسی)",
    max: 100000,
  },
  {
    key: "webhooks",
    label: "تعداد وب‌هوک",
    unit: "وب‌هوک",
    kind: "count",
    scope: "salon",
    icon: "🔌",
    hint: "افزودن وب‌هوک در بخش یکپارچه‌سازی",
    max: 1000,
  },
  {
    key: "smsPerMonth",
    label: "پیامک ارسالی در ماه",
    unit: "پیامک",
    kind: "count",
    scope: "salon",
    monthly: true,
    icon: "📩",
    hint: "یادآوری، تأیید نوبت، فاکتور و کمپین (از ابتدای ماه شمسی)",
    max: 1000000,
  },
  // ─── سقف‌های عددی سطح مالک حساب ───────────────────────────────────────
  {
    key: "salons",
    label: "تعداد سالن هر کاربر",
    unit: "سالن",
    kind: "count",
    scope: "owner",
    icon: "🏪",
    hint: "دکمهٔ «ساخت سالن جدید» در داشبورد",
    max: 1000,
  },
  // ─── امکان‌های روشن/خاموش ─────────────────────────────────────────────
  {
    key: "voiceBooking",
    label: "رزرو صوتی با هوش مصنوعی",
    unit: "",
    kind: "bool",
    scope: "salon",
    icon: "🎙️",
    hint: "بخش رزرو صوتی و تبدیل گفتار به نوبت",
    max: 1,
  },
  {
    key: "smsReminders",
    label: "پیامک یادآوری خودکار",
    unit: "",
    kind: "bool",
    scope: "salon",
    icon: "⏰",
    hint: "کرون یادآوری‌ها قبل از نوبت",
    max: 1,
  },
  {
    key: "webapp",
    label: "وب‌اپ نصب‌شدنی و گالری",
    unit: "",
    kind: "bool",
    scope: "salon",
    icon: "📲",
    hint: "PWA سالن و بارگذاری تصویر گالری",
    max: 1,
  },
  {
    key: "csvExport",
    label: "خروجی اکسل و CSV",
    unit: "",
    kind: "bool",
    scope: "salon",
    icon: "📊",
    hint: "دکمه‌های خروجی گرفتن در گزارش‌ها",
    max: 1,
  },
  {
    key: "customDomain",
    label: "دامنه اختصاصی سالن",
    unit: "",
    kind: "bool",
    scope: "salon",
    icon: "🌐",
    hint: "تنظیم دامنه در تنظیمات سالن",
    max: 1,
  },
  {
    key: "api",
    label: "وب‌هوک و API",
    unit: "",
    kind: "bool",
    scope: "salon",
    icon: "🔗",
    hint: "کلید دسترسی به بخش یکپارچه‌سازی و ساخت وب‌هوک",
    max: 1,
  },
];

/** فقط کلیدهای عددی (سقف شمارشی) */
export const COUNT_DEFS = LIMIT_DEFS.filter((d) => d.kind === "count");
/** فقط امکان‌های روشن/خاموش */
export const BOOL_DEFS = LIMIT_DEFS.filter((d) => d.kind === "bool");

const BY_KEY = new Map(LIMIT_DEFS.map((d) => [d.key as string, d]));

export function findLimitDef(key: string): LimitDef | undefined {
  return BY_KEY.get(key);
}

/** «تا ۲۰ خدمت» / «۳۰۰ پیامک نامحدود» / «فعال» */
export function formatLimit(def: LimitDef, value: number | boolean): string {
  if (def.kind === "bool") return value ? "فعال" : "غیرفعال";
  if (typeof value !== "number") return "—";
  if (value >= UNLIMITED_FROM) return `${def.unit || def.label} نامحدود`;
  const n = faDigits(value.toLocaleString("en-US"));
  return def.monthly ? `${n} ${def.unit} در ماه` : `تا ${n} ${def.unit}`;
}

/** کلید تنظیمات دست‌ی سوپرادمین برای یک پلن + محدودیت */
export function limitSettingKey(plan: string, key: keyof PlanLimits): string {
  return `plan.limit.${plan}.${key}`;
}
