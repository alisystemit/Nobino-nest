import { getSetting } from "@/lib/settings";
import { isDevelopmentEnv, isProductionEnv } from "@/lib/env";

/** کلید تنظیمی سوئیچ نمایش کدها (در پنل سوپرادمین، بخش پیامک) */
export const SHOW_SENT_CODES_KEY = "sms.show_sent_codes";

/**
 * راه‌آهن فرار صریح برای محیط production.
 * پیش‌فرض خاموش است؛ فقط اگر عمداً `true` شود و سوئیچ پنل هم روشن باشد کدها
 * از API عمومی برمی‌گردند. در بوت یک هشدار در لاگ ثبت می‌شود.
 */
export const ALLOW_CODES_IN_PROD_ENV = "OTP_DISPLAY_ALLOW_PRODUCTION";

function allowCodesInProduction(): boolean {
  return (process.env[ALLOW_CODES_IN_PROD_ENV] ?? "").trim().toLowerCase() === "true";
}

/** آیا در محیط production نمایش کد OTP به‌صورت صریح مجاز شده است؟ (برای هشدار بوت) */
export function codesAllowedInProduction(): boolean {
  return isProductionEnv() && allowCodesInProduction();
}

/**
 * آیا کد ارسال‌شده (پیامک یا ایمیل) می‌تواند در صفحه ورود نمایش داده شود؟
 *
 * - در `production`: همیشه «نه»، مگر اپراتور صریحاً
 *   `OTP_DISPLAY_ALLOW_PRODUCTION=true` را ست کرده باشد **و** سوئیچ پنل روشن باشد.
 *   این مسیر کد هر شماره‌ای را بدون احراز هویت برمی‌گرداند، پس نباید با یک
 *   اشتباه در تنظیمات پنل روی پروداکشن باز شود.
 * - سوئیچ صریح «true»: بله (تصمیم آگاهانهٔ سوپرادمین).
 * - سوئیچ صریح «false»: هرگز.
 * - بدون تنظیم: فقط در محیط توسعهٔ صریح (`NODE_ENV=development/test`).
 */
export async function canShowSentCodes(): Promise<boolean> {
  const raw = await getSetting(SHOW_SENT_CODES_KEY);
  const explicit = (raw ?? "").trim().toLowerCase();

  if (isProductionEnv()) {
    return allowCodesInProduction() && explicit === "true";
  }

  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return isDevelopmentEnv();
}
