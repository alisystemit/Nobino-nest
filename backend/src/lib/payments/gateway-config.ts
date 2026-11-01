import { createHmac } from "node:crypto";
import { settingOrEnv } from "@/lib/settings";

/**
 * کاتالوگ اعتبارنامهٔ درگاه‌های پرداخت (منبع واحد حقیقت برای پنل تنظیمات).
 *
 * هر درگاه پیش‌تر فقط از `process.env` می‌خواند (مثلاً `env.ZARINPAL_MERCHANT_ID`)
 * و به همین دلیل سوپرادمین نمی‌توانست مرچنت‌کد/ترمینال را از پنل وارد کند.
 * حالا ترتیب اولویت این است:
 *
 *   ۱) تنظیم پویا در جدول `Setting` با کلید `payments.<gatewayId>.<field>`
 *   ۲) متغیر محیطی معادل آن (برای سازگاری با استقرارهای فعلی و کیت داکر/PaaS)
 *
 * برای افزودن درگاه جدید: یک ورودی به `gatewayCredentialMeta` اضافه کنید و
 * در کلاس آن درگاه به‌جای `env.X` از `await this.cred("x", env.X)` استفاده کنید.
 */

export type GatewayCredentialType = "secret" | "string" | "boolean";

export interface GatewayCredentialField {
  /** بخش انتهایی کلید تنظیم؛ مثل merchant_id → payments.zarinpal.merchant_id */
  key: string;
  /** برچسب فارسی برای پنل */
  label: string;
  type: GatewayCredentialType;
  /** نام متغیر محیطی جایگزین (fallback) */
  env?: string;
  hint?: string;
}

export interface GatewayCredentialMeta {
  id: string;
  name: string;
  fields: GatewayCredentialField[];
}

/** فیلد مشترک «حالت سندباکس» — true = شبیه‌سازی، false = درگاه واقعی */
const sandboxField = (env?: string): GatewayCredentialField => ({
  key: "sandbox",
  label: "حالت شبیه‌سازی (سندباکس)",
  type: "boolean",
  env,
  hint: "خاموش کردن این گزینه تراکنش را به درگاه واقعی می‌فرستد.",
});

const apiKey = (env: string): GatewayCredentialField => ({ key: "api_key", label: "کلید API", type: "secret", env });
const merchant = (env?: string): GatewayCredentialField => ({ key: "merchant_id", label: "مرچنت‌کد / Merchant ID", type: "string", env });
const terminal = (env?: string): GatewayCredentialField => ({ key: "terminal_id", label: "ترمینال / Terminal ID", type: "string", env });
const user = (env: string): GatewayCredentialField => ({ key: "username", label: "نام کاربری", type: "string", env });
const pass = (env: string): GatewayCredentialField => ({ key: "password", label: "رمز عبور", type: "secret", env });
/** کلید امضای درگاه (HMAC/SHA) — همان چیزی که بدون آن `Sign`/`hash` درخواست بی‌معنی است */
const shaKey = (env: string, label = "کلید امضا (SHA/HMAC Key)"): GatewayCredentialField => ({
  key: "sha_key",
  label,
  type: "secret",
  env,
  hint: "با این کلید امضای درخواست ساخته می‌شود؛ اگر خالی باشد امضا محاسبه نمی‌شود و درگاه واقعی خطا می‌دهد.",
});

export const gatewayCredentialMeta: GatewayCredentialMeta[] = [
  { id: "zarinpal", name: "زرین‌پال", fields: [merchant("ZARINPAL_MERCHANT_ID"), sandboxField("ZARINPAL_SANDBOX")] },
  {
    id: "mellat",
    name: "بانک ملت (به‌پرداخت)",
    fields: [terminal("MELLAT_TERMINAL_ID"), user("MELLAT_USERNAME"), pass("MELLAT_PASSWORD"), sandboxField("MELLAT_SANDBOX")],
  },
  {
    // سامان (سپهر) علاوه بر ترمینال به Merchant و Password هم نیاز دارد
    id: "saman",
    name: "سامان (سپهر)",
    fields: [terminal("SAMAN_TERMINAL_ID"), merchant("SAMAN_MERCHANT_ID"), pass("SAMAN_PASSWORD"), sandboxField("SAMAN_SANDBOX")],
  },
  { id: "parsian", name: "پارسیان", fields: [user("PARSIAN_USERNAME"), sandboxField("PARSIAN_SANDBOX")] },
  {
    // کلید امضای پاسارگاد قبلاً در کد hard-code بود؛ حالا تنظیم پنل/env است
    id: "pasargad",
    name: "پاسارگاد",
    fields: [terminal("PASARGAD_TERMINAL_ID"), merchant("PASARGAD_USERNAME"), shaKey("PASARGAD_SHA_KEY"), sandboxField("PASARGAD_SANDBOX")],
  },
  {
    id: "asanpardakht",
    name: "آسان‌پرداخت",
    fields: [
      merchant("ASANPARDASHT_MERCHANT_ID"),
      { key: "pin1", label: "Pin1 (رمز ورود API)", type: "secret", env: "ASANPARDASHT_PIN1" },
      { key: "pin2", label: "Pin2 (کلید امضا)", type: "secret", env: "ASANPARDASHT_PIN2" },
      sandboxField("ASANPARDASHT_SANDBOX"),
    ],
  },
  {
    id: "irankish",
    name: "ایران‌کیش",
    fields: [terminal("IRANKISH_TERMINAL_ID"), merchant("IRANKISH_MERCHANT_ID"), shaKey("IRANKISH_SHA_KEY"), sandboxField("IRANKISH_SANDBOX")],
  },
  {
    id: "behpardakht",
    name: "به‌پرداخت ملت (alias)",
    fields: [terminal("BEHPARDAKHT_MERCHANT_ID"), user("MELLAT_USERNAME"), pass("MELLAT_PASSWORD"), sandboxField("BEHPARDAKHT_SANDBOX")],
  },
  {
    id: "sadad",
    name: "سداد (بانک ملی)",
    fields: [terminal("SADAD_TERMINAL_ID"), merchant("SADAD_MERCHANT_ID"), shaKey("SADAD_SHA_KEY"), sandboxField("SADAD_SANDBOX")],
  },
  {
    id: "maban",
    name: "مبناکارت",
    fields: [terminal("MABNA_TERMINAL_ID"), merchant("MABNA_MERCHANT_ID"), shaKey("MABNA_SHA_KEY"), sandboxField("MABNA_SANDBOX")],
  },
  {
    id: "cetab",
    name: "سی‌تاب (تجارت)",
    fields: [terminal("CETAB_TERMINAL_ID"), merchant("CETAB_MERCHANT_ID"), shaKey("CETAB_SHA_KEY"), sandboxField("CETAB_SANDBOX")],
  },
  {
    id: "pardakhtnet",
    name: "پرداخت‌نت",
    fields: [apiKey("PARDASHTNET_API_KEY"), merchant("PARDASHTNET_MERCHANT_ID"), sandboxField("PARDASHTNET_SANDBOX")],
  },
  {
    id: "psp",
    name: "PSP",
    fields: [apiKey("PSP_API_KEY"), merchant("PSP_MERCHANT_ID"), sandboxField("PSP_SANDBOX")],
  },
  { id: "nextpay", name: "نکست‌پی", fields: [apiKey("NEXTPAY_API_KEY"), merchant("NEXTPAY_MERCHANT_ID"), sandboxField("NEXTPAY_SANDBOX")] },
  {
    id: "vanak",
    name: "ونکی (بانک دی)",
    fields: [
      terminal("VANAK_TERMINAL_ID"),
      merchant("VANAK_MERCHANT_ID"),
      user("VANAK_USERNAME"),
      pass("VANAK_PASSWORD"),
      sandboxField("VANAK_SANDBOX"),
    ],
  },
  // چهار درگاه زیر قبلاً فقط PSP_API_KEY را می‌خواندند و sandboxشان سخت‌کدِ true بود؛
  // حالا اعتبارنامه، کلید env مستقل و کلید sandbox خودشان را دارند (fallback به PSP_*).
  { id: "payir", name: "پی‌آی‌آر", fields: [apiKey("PAYIR_API_KEY"), sandboxField()] },
  { id: "idpay", name: "آیدی‌پی", fields: [apiKey("IDPAY_API_KEY"), sandboxField()] },
  { id: "amanat", name: "آمانت", fields: [apiKey("AMANAT_API_KEY"), sandboxField()] },
  {
    id: "zibal",
    name: "زیبال",
    fields: [apiKey("ZIBAL_API_KEY"), merchant("ZIBAL_MERCHANT_ID"), sandboxField()],
  },
];

const metaById = new Map(gatewayCredentialMeta.map((g) => [g.id, g]));

export function gatewayCredentialMetaFor(id: string): GatewayCredentialMeta | undefined {
  return metaById.get(id);
}

/** پیشوند کلیدهای تنظیم یک درگاه در جدول Setting */
export function gatewaySettingsPrefix(id: string): string {
  return `payments.${id}.`;
}

/**
 * خواندن یک اعتبارنامه: تنظیم پویا و اگر نبود، متغیر محیطی.
 * مقدار `envFallback` باید همان مقدار env خوانده‌شده در زمان فراخوانی باشد
 * (تا تغییرات runtime لاگ-فرند بدون شکستن رفتار قبلی اعمال شود).
 */
export async function gwCredential(id: string, field: string, envFallback?: string): Promise<string> {
  const value = await settingOrEnv(`${gatewaySettingsPrefix(id)}${field}`, envFallback);
  return value ?? "";
}

/**
 * آیا درگاه فعلاً در حالت شبیه‌سازی است؟
 * کلید پویای `payments.<id>.sandbox` برنده است؛ اگر تنظیم نشده باشد مقدار
 * پیش‌فرض (معمولاً از env یا مقدار سخت‌کد کلاس) حفظ می‌شود.
 */
export async function gwIsSandbox(id: string, defaultSandbox: boolean): Promise<boolean> {
  const raw = await settingOrEnv(`${gatewaySettingsPrefix(id)}sandbox`, undefined);
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (!trimmed) return defaultSandbox;
  return trimmed === "true" || trimmed === "1" || trimmed === "yes";
}

/** آیا همهٔ اعتبارنامه‌های لازم (بدون در نظر گرفتن sandbox) پر شده‌اند؟ */
export async function gwIsConfigured(id: string): Promise<boolean> {
  const meta = metaById.get(id);
  if (!meta) return false;
  const required = meta.fields.filter((f) => f.key !== "sandbox");
  if (required.length === 0) return true;
  for (const f of required) {
    const v = await gwCredential(id, f.key, f.env ? process.env[f.env] : undefined);
    if (!v.trim()) return false;
  }
  return true;
}

/**
 * امضای مشترک بدنهٔ درخواست با کلید درگاه (HMAC-SHA256).
 * فیلدها به ترتیب کلیدهای شیء با `,` به هم می‌چسبند و کلید امضا آخر می‌آید —
 * الگویی که بیشتر درگاه‌های شاپرک (ایران‌کیش، سی‌تاب، مبناکارت) مستند کرده‌اند.
 * اگر کلید تنظیم نشده باشد رشتهٔ خالی برمی‌گردد تا درگاه «امضانشده» ارسال نشود.
 */
export function gwSign(fields: Record<string, string | number>, key: string): string {
  if (!key) return "";
  const payload = Object.values(fields).join(",") + "," + key;
  return createHmac("sha256", key).update(payload).digest("hex");
}
