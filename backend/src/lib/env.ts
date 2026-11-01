import { z } from "zod";

/**
 * اعتبارسنجی متمرکز متغیرهای محیطی.
 * مقادیر اختیاری که در توسعه استفاده نمی‌شوند، جایگزین پیش‌فرض می‌گیرند.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16).default("dev-secret-change-me"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  APP_URL: z.string().url().default("http://localhost:5173"),
  SITE_URL: z.string().url().optional(),
  ROOT_DOMAIN: z.string().default("localhost"),

  SMS_PROVIDER: z.enum(["kavenegar", "smsdotir", "mock"]).default("mock"),
  KAVENEGAR_API_KEY: z.string().default(""),
  SMSDOTIR_API_KEY: z.string().default(""),
  SMSDOTIR_SENDER: z.string().default(""),

  VOICE_PROVIDER: z.enum(["openai", "mock"]).default("mock"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("whisper-1"),

  // سرویس‌های متن هوشمند (LLM) — جایگزین env برای کلیدهای پنل تنظیمات
  GROQ_API_KEY: z.string().default(""),
  DEEPSEEK_API_KEY: z.string().default(""),
  AI_CUSTOM_API_KEY: z.string().default(""),
  AI_CUSTOM_BASE_URL: z.string().default(""),

  PAYMENT_DEFAULT_GATEWAY: z.string().default("sandbox"),
  PAYMENT_SANDBOX: z.string().default("true"),
  PAYMENT_CALLBACK_BASE: z.string().default("http://localhost:3000/api/payments/callback"),

  ZARINPAL_MERCHANT_ID: z.string().default(""),
  ZARINPAL_SANDBOX: z.string().default("true"),

  MELLAT_TERMINAL_ID: z.string().default(""),
  MELLAT_USERNAME: z.string().default(""),
  MELLAT_PASSWORD: z.string().default(""),
  MELLAT_SANDBOX: z.string().default("true"),

  SAMAN_TERMINAL_ID: z.string().default(""),
  SAMAN_MERCHANT_ID: z.string().default(""),
  SAMAN_PASSWORD: z.string().default(""),
  SAMAN_SANDBOX: z.string().default("true"),

  PARSIAN_TERMINAL_ID: z.string().default(""),
  PARSIAN_USERNAME: z.string().default(""),
  PARSIAN_PASSWORD: z.string().default(""),
  PARSIAN_SANDBOX: z.string().default("true"),

  PASARGAD_TERMINAL_ID: z.string().default(""),
  PASARGAD_USERNAME: z.string().default(""),
  PASARGAD_PASSWORD: z.string().default(""),
  PASARGAD_SHA_KEY: z.string().default(""),
  PASARGAD_SANDBOX: z.string().default("true"),

  ASANPARDASHT_MERCHANT_ID: z.string().default(""),
  ASANPARDASHT_CONFIG_ID: z.string().default(""),
  ASANPARDASHT_PIN1: z.string().default(""),
  ASANPARDASHT_PIN2: z.string().default(""),
  ASANPARDASHT_SANDBOX: z.string().default("true"),

  IRANKISH_TERMINAL_ID: z.string().default(""),
  IRANKISH_MERCHANT_ID: z.string().default(""),
  IRANKISH_SHA_KEY: z.string().default(""),
  IRANKISH_SANDBOX: z.string().default("true"),

  BEHPARDAKHT_MERCHANT_ID: z.string().default(""),
  BEHPARDAKHT_SANDBOX: z.string().default("true"),

  SADAD_TERMINAL_ID: z.string().default(""),
  SADAD_MERCHANT_ID: z.string().default(""),
  SADAD_SHA_KEY: z.string().default(""),
  SADAD_SANDBOX: z.string().default("true"),

  MABNA_TERMINAL_ID: z.string().default(""),
  MABNA_MERCHANT_ID: z.string().default(""),
  MABNA_SHA_KEY: z.string().default(""),
  MABNA_SANDBOX: z.string().default("true"),

  CETAB_TERMINAL_ID: z.string().default(""),
  CETAB_MERCHANT_ID: z.string().default(""),
  CETAB_SHA_KEY: z.string().default(""),
  CETAB_SANDBOX: z.string().default("true"),

  PARDASHTNET_MERCHANT_ID: z.string().default(""),
  PARDASHTNET_API_KEY: z.string().default(""),
  PARDASHTNET_SANDBOX: z.string().default("true"),

  PSP_MERCHANT_ID: z.string().default(""),
  PSP_API_KEY: z.string().default(""),
  PSP_SANDBOX: z.string().default("true"),

  NEXTPAY_MERCHANT_ID: z.string().default(""),
  NEXTPAY_API_KEY: z.string().default(""),
  NEXTPAY_SANDBOX: z.string().default("true"),

  VANAK_TERMINAL_ID: z.string().default(""),
  VANAK_MERCHANT_ID: z.string().default(""),
  VANAK_USERNAME: z.string().default(""),
  VANAK_PASSWORD: z.string().default(""),
  VANAK_SANDBOX: z.string().default("true"),

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

export const isSandbox = (key?: string) =>
  (key ?? "true").toLowerCase() === "true";
