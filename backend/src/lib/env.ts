import { z } from "zod";
import { siteOriginSafe } from "@/lib/site-origin";

/**
 * اعتبارسنجی متمرکز متغیرهای محیطی.
 * مقادیر اختیاری که در توسعه استفاده نمی‌شوند، جایگزین پیش‌فرض می‌گیرند.
 */
const isProdEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
/** پیش‌فرض حالت تست درگاه: در production «false» تا پرداخت واقعی شبیه‌سازی ثبت نشود */
const sandboxDefault = isProdEnv ? "false" : "true";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  APP_URL: z.string().url().default("http://localhost:5175"),
  SITE_URL: z.string().url().optional(),
  ROOT_DOMAIN: z.string().default("localhost"),

  // همهٔ سرویس‌هایی که در lib/sms/providers.ts پیاده شده‌اند؛ فهرست قبلی
  // (kavenegar/smsdotir/mock) باعث می‌شد SMS_PROVIDER=arpano کل اپ را در بوت کرش دهد.
  SMS_PROVIDER: z
    .enum([
      "kavenegar",
      "smsdotir",
      "farazsms",
      "ghasedak",
      "melipayamak",
      "iransms",
      "payamresan",
      "nakalaya",
      "mobilesms",
      "arpano",
      "mock",
    ])
    .default("mock"),
  KAVENEGAR_API_KEY: z.string().default(""),
  SMSDOTIR_API_KEY: z.string().default(""),
  SMSDOTIR_SENDER: z.string().default(""),
  FARAZSMS_USERNAME: z.string().default(""),
  FARAZSMS_PASSWORD: z.string().default(""),
  FARAZSMS_FROM: z.string().default(""),
  GHASEDAK_API_KEY: z.string().default(""),
  GHASEDAK_SENDER: z.string().default(""),
  MELIPAYAMAK_USERNAME: z.string().default(""),
  MELIPAYAMAK_PASSWORD: z.string().default(""),
  MELIPAYAMAK_FROM: z.string().default(""),
  IRANSMS_API_KEY: z.string().default(""),
  PAYAMRESAN_API_KEY: z.string().default(""),
  NAKALAYA_API_KEY: z.string().default(""),
  MOBILESMS_API_KEY: z.string().default(""),
  ARPANO_USERNAME: z.string().default(""),
  ARPANO_PASSWORD: z.string().default(""),
  ARPANO_FROM: z.string().default(""),

  // متغیرهای محیطی که میدل‌ور/اسکریپت‌ها مستقیم از process.env می‌خوانند؛
  // اینجا ثبت می‌شوند تا در schema معلوم باشند و روی env در دسترس بمانند.
  AUTH_COOKIE_SECURE: z.string().default(""),
  CRON_SECRET: z.string().default(""),
  CORS_ORIGIN: z.string().default(""),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.string().default(""),
  SERVE_FRONTEND: z.string().default(""),
  SPA_DIST: z.string().default(""),
  SPA_DISABLED: z.string().default(""),
  NODE_ENV: z.string().default("development"),

  VOICE_PROVIDER: z.enum(["openai", "mock"]).default("mock"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("whisper-1"),

  // سرویس‌های متن هوشمند (LLM) — جایگزین env برای کلیدهای پنل تنظیمات
  GROQ_API_KEY: z.string().default(""),
  DEEPSEEK_API_KEY: z.string().default(""),
  AI_CUSTOM_API_KEY: z.string().default(""),
  AI_CUSTOM_BASE_URL: z.string().default(""),

  PAYMENT_DEFAULT_GATEWAY: z.string().default("sandbox"),
  PAYMENT_SANDBOX: z.string().default(sandboxDefault),
  // از اوریجین سایت ساخته می‌شود؛ پیش‌فرضِ hardکدشدهٔ `localhost:3000` باعث
  // می‌شد callback درگاه در نصب‌های فراموش‌کار به لوکال برود.
  PAYMENT_CALLBACK_BASE: z.string().default(`${siteOriginSafe()}/api/payments/callback`),

  ZARINPAL_MERCHANT_ID: z.string().default(""),
  ZARINPAL_SANDBOX: z.string().default(sandboxDefault),

  MELLAT_TERMINAL_ID: z.string().default(""),
  MELLAT_USERNAME: z.string().default(""),
  MELLAT_PASSWORD: z.string().default(""),
  MELLAT_SANDBOX: z.string().default(sandboxDefault),

  SAMAN_TERMINAL_ID: z.string().default(""),
  SAMAN_MERCHANT_ID: z.string().default(""),
  SAMAN_PASSWORD: z.string().default(""),
  SAMAN_SANDBOX: z.string().default(sandboxDefault),

  PARSIAN_TERMINAL_ID: z.string().default(""),
  PARSIAN_USERNAME: z.string().default(""),
  PARSIAN_PASSWORD: z.string().default(""),
  PARSIAN_SANDBOX: z.string().default(sandboxDefault),

  PASARGAD_TERMINAL_ID: z.string().default(""),
  PASARGAD_USERNAME: z.string().default(""),
  PASARGAD_PASSWORD: z.string().default(""),
  PASARGAD_SHA_KEY: z.string().default(""),
  PASARGAD_SANDBOX: z.string().default(sandboxDefault),

  ASANPARDASHT_MERCHANT_ID: z.string().default(""),
  ASANPARDASHT_CONFIG_ID: z.string().default(""),
  ASANPARDASHT_PIN1: z.string().default(""),
  ASANPARDASHT_PIN2: z.string().default(""),
  ASANPARDASHT_SANDBOX: z.string().default(sandboxDefault),

  IRANKISH_TERMINAL_ID: z.string().default(""),
  IRANKISH_MERCHANT_ID: z.string().default(""),
  IRANKISH_SHA_KEY: z.string().default(""),
  IRANKISH_SANDBOX: z.string().default(sandboxDefault),

  BEHPARDAKHT_MERCHANT_ID: z.string().default(""),
  BEHPARDAKHT_SANDBOX: z.string().default(sandboxDefault),

  SADAD_TERMINAL_ID: z.string().default(""),
  SADAD_MERCHANT_ID: z.string().default(""),
  SADAD_SHA_KEY: z.string().default(""),
  SADAD_SANDBOX: z.string().default(sandboxDefault),

  MABNA_TERMINAL_ID: z.string().default(""),
  MABNA_MERCHANT_ID: z.string().default(""),
  MABNA_SHA_KEY: z.string().default(""),
  MABNA_SANDBOX: z.string().default(sandboxDefault),

  CETAB_TERMINAL_ID: z.string().default(""),
  CETAB_MERCHANT_ID: z.string().default(""),
  CETAB_SHA_KEY: z.string().default(""),
  CETAB_SANDBOX: z.string().default(sandboxDefault),

  PARDASHTNET_MERCHANT_ID: z.string().default(""),
  PARDASHTNET_API_KEY: z.string().default(""),
  PARDASHTNET_SANDBOX: z.string().default(sandboxDefault),

  PSP_MERCHANT_ID: z.string().default(""),
  PSP_API_KEY: z.string().default(""),
  PSP_SANDBOX: z.string().default(sandboxDefault),

  NEXTPAY_MERCHANT_ID: z.string().default(""),
  NEXTPAY_API_KEY: z.string().default(""),
  NEXTPAY_SANDBOX: z.string().default(sandboxDefault),

  VANAK_TERMINAL_ID: z.string().default(""),
  VANAK_MERCHANT_ID: z.string().default(""),
  VANAK_USERNAME: z.string().default(""),
  VANAK_PASSWORD: z.string().default(""),
  VANAK_SANDBOX: z.string().default(sandboxDefault),

  // درگاه‌هایی که قبلاً کلیدشان را از PSP_* می‌خواندند؛ نام env مستقل دارند
  // و در کد با `env.X || env.PSP_API_KEY` به همان مقادیر قدیمی برمی‌گردند.
  PAYIR_API_KEY: z.string().default(""),
  IDPAY_API_KEY: z.string().default(""),
  AMANAT_API_KEY: z.string().default(""),
  ZIBAL_API_KEY: z.string().default(""),
  ZIBAL_MERCHANT_ID: z.string().default(""),

  BLOB_READ_WRITE_TOKEN: z.string().default(""),
  BLOB_STORE_ID: z.string().default(""),
});

export const env = envSchema.parse(process.env);

/**
 * حالت sandbox فقط وقتی صریح «true» ست شده فعال است؛ مقدار نا شناسه/خالی
 * هرگز نباید پرداخت واقعی را شبیه‌سازی‌شده علامت بزند.
 */
export const isSandbox = (key?: string) => (key ?? "").trim().toLowerCase() === "true";

/**
 * بررسی‌های سختِ محیط production. لیست خطاها را برمی‌گرداند؛ فراخوان
 * مسئول تصمیم است (main.ts در production با این‌ها متوقف می‌شود).
 */
export function productionEnvErrors(): string[] {
  const errors: string[] = [];
  if (env.JWT_SECRET.trim() === "dev-secret-change-me") {
    errors.push("JWT_SECRET هنوز مقدار پیش‌فرض dev است؛ یک رمز تصادفی حداقل ۳۲ کاراکتر بگذارید.");
  }
  const callbackBase = env.PAYMENT_CALLBACK_BASE.trim().toLowerCase();
  if (callbackBase.includes("localhost") || callbackBase.includes("127.0.0.1")) {
    errors.push(`PAYMENT_CALLBACK_BASE به آدرس لوکال اشاره می‌کند (${callbackBase})؛ درگاه هرگز به این آدرس باز نمی‌گردد.`);
  }
  if (isSandbox(env.PAYMENT_SANDBOX)) {
    errors.push("PAYMENT_SANDBOX=true در production؛ پرداخت واقعی درگاه به‌صورت شبیه‌سازی‌شده ثبت می‌شود.");
  }
  return errors;
}
