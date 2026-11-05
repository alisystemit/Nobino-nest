import { getSetting } from "@/lib/settings";
import { isDevelopmentEnv } from "@/lib/env";

/** کلید تنظیمی سوئیچ نمایش کدها (در پنل سوپرادمین، بخش پیامک) */
export const SHOW_SENT_CODES_KEY = "sms.show_sent_codes";

/**
 * آیا کد ارسال‌شده (پیامک یا ایمیل) می‌تواند در صفحه ورود نمایش داده شود؟
 *
 * - سوئیچ صریح «true»: همیشه بله (تصمیم آگاهانهٔ سوپرادمین).
 * - سوئیچ صریح «false»: هرگز.
 * - بدون تنظیم: فقط در محیط توسعهٔ صریح (`NODE_ENV=development/test`).
 *   قبلاً شرط `NODE_ENV !== "production"` بود که در استقرارهای بدون NODE_ENV
 *   همیشه «توسعه» حساب می‌شد و کد هر شماره‌ای را روی API عمومی فاش می‌کرد.
 *
 * هشدار: این قابلیت راه‌آهن تست است و در سرویس واقعی باید خاموش بماند،
 * چون هر کسی که صفحهٔ ورود را باز کند می‌تواند کد تأیید را ببیند.
 */
export async function canShowSentCodes(): Promise<boolean> {
  const raw = await getSetting(SHOW_SENT_CODES_KEY);
  const explicit = (raw ?? "").trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return isDevelopmentEnv();
}
