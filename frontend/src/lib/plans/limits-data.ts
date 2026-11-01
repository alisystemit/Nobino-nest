/**
 * داده‌های خالص محدودیت پلن‌ها (بدون دیتابیس، بدون import با نام مستعار `@/`).
 *
 * جدا نگه‌داشتن این بخش از `limits.ts` دو فایده دارد:
 * ۱) در تست واحد (`node --test`) بدون بالا آمدن Prisma قابل اجراست.
 * ۲) در کامپوننت کلاینت (ماتریس پنل و صفحهٔ پکیج‌ها) قابل import است.
 */
import { LIMIT_DEFS, UNLIMITED_FROM, type LimitDef } from "./limit-defs.ts";

export type PlanName = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

/** کلیدهای شمارشی (سقف تعداد) */
export type NumericLimitKey =
  | "staff"
  | "branches"
  | "services"
  | "galleryItems"
  | "customers"
  | "campaigns"
  | "webhooks"
  | "smsPerMonth"
  | "salons";

/** کلیدهای روشن/خاموش (امکان) */
export type BoolLimitKey = "webapp" | "voiceBooking" | "csvExport" | "customDomain" | "smsReminders" | "api";

export type PlanLimits = Record<NumericLimitKey, number> & Record<BoolLimitKey, boolean>;

export const PLAN_ORDER: PlanName[] = ["FREE", "BASIC", "PRO", "ENTERPRISE"];

export const PLAN_LABELS: Record<PlanName, string> = {
  FREE: "رایگان",
  BASIC: "پایه",
  PRO: "حرفه‌ای",
  ENTERPRISE: "سازمانی",
};

/**
 * ماتریس پیش‌فرض سقف‌ها. اعداد فقط «شروع» هستند؛ سوپرادمین می‌تواند هر خانه را
 * از تب «محدودیت‌ها» عوض کند (کلید `plan.limit.<PLAN>.<key>`).
 * ۱۰۰۰۰۰ و بالاتر در نمایش «نامحدود» حساب می‌شود.
 */
export const PLAN_DEFAULTS: Record<PlanName, PlanLimits> = {
  FREE: {
    staff: 5,
    branches: 2,
    services: 20,
    galleryItems: 12,
    customers: 200,
    campaigns: 3,
    webhooks: 0,
    smsPerMonth: 300,
    salons: 1,
    webapp: true,
    voiceBooking: true,
    csvExport: true,
    customDomain: false,
    smsReminders: true,
    api: false,
  },
  BASIC: {
    staff: 15,
    branches: 5,
    services: 60,
    galleryItems: 60,
    customers: 1500,
    campaigns: 15,
    webhooks: 3,
    smsPerMonth: 1500,
    salons: 2,
    webapp: true,
    voiceBooking: true,
    csvExport: true,
    customDomain: false,
    smsReminders: true,
    api: true,
  },
  PRO: {
    staff: 60,
    branches: 20,
    services: 200,
    galleryItems: 200,
    customers: 8000,
    campaigns: 60,
    webhooks: 15,
    smsPerMonth: 6000,
    salons: 5,
    webapp: true,
    voiceBooking: true,
    csvExport: true,
    customDomain: true,
    smsReminders: true,
    api: true,
  },
  ENTERPRISE: {
    staff: 1000,
    branches: 200,
    services: 100000,
    galleryItems: 100000,
    customers: 1000000,
    campaigns: 100000,
    webhooks: 100,
    smsPerMonth: 1000000,
    salons: 1000,
    webapp: true,
    voiceBooking: true,
    csvExport: true,
    customDomain: true,
    smsReminders: true,
    api: true,
  },
};

/**
 * سازگاری زمان اجرا: هر کلید باید هم در کاتالوگ و هم در پیش‌فرض پلن‌ها باشد.
 * خالی بودن نتیجه یعنی افزودن/حذف یک محدودیت کامل انجام شده است.
 */
export function limitCatalogIssues(): string[] {
  const issues: string[] = [];
  const keys = LIMIT_DEFS.map((d) => d.key as string);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dup.length) issues.push(`کلید تکراری در کاتالوگ: ${dup.join("، ")}`);

  for (const key of Object.keys(PLAN_DEFAULTS.FREE)) {
    if (!keys.includes(key)) issues.push(`«${key}» در کاتالوگ محدودیت‌ها تعریف نشده است`);
  }
  for (const def of LIMIT_DEFS) {
    const k = def.key as string;
    for (const plan of PLAN_ORDER) {
      if ((PLAN_DEFAULTS[plan] as Record<string, unknown>)[k] === undefined) {
        issues.push(`پیش‌فرض «${k}» در پلن ${plan} تعریف نشده است`);
      }
    }
  }
  return issues;
}

/**
 * سقف مجاز ورودی یک خانه در فرم پنل: دست‌کم آستانهٔ «نامحدود» و همیشه بزرگ‌تر یا
 * برابر با پیش‌فرض هر چهار پلن. نتیجه: سوپرادمین می‌تواند هر سقفی را «نامحدود»
 * کند و عددِ از پیش‌فرض پلن سازمانی کوچک‌تر، در فرم نامعتبر نمایش داده نمی‌شود.
 */
export function entryCeiling(def: LimitDef): number {
  if (def.kind !== "count") return def.max;
  return PLAN_ORDER.reduce((n, plan) => {
    const v = PLAN_DEFAULTS[plan][def.key];
    return typeof v === "number" && v > n ? v : n;
  }, Math.max(def.max, UNLIMITED_FROM));
}

/** کاتالوگ با سقف ورودی محاسبه‌شده — همان چیزی که پنل و اعتبارسنجی سرور می‌بینند */
export const INPUT_LIMIT_DEFS: LimitDef[] = LIMIT_DEFS.map((d) => ({ ...d, max: entryCeiling(d) }));

export function findInputLimitDef(key: string): LimitDef | undefined {
  return INPUT_LIMIT_DEFS.find((d) => (d.key as string) === key);
}

export function normalizePlan(value: string | null | undefined): PlanName {
  const upper = (value ?? "").trim().toUpperCase();
  return (PLAN_ORDER as string[]).includes(upper) ? (upper as PlanName) : "FREE";
}

/** بالاترین پلن میان چند سالن یک کاربر (برای سقف‌های سطح مالک) */
export function bestPlan(values: (string | null | undefined)[]): PlanName {
  return values.reduce<PlanName>((best, v) => {
    const p = normalizePlan(v);
    return PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(best) ? p : best;
  }, "FREE");
}
