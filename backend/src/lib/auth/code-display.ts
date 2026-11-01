import { getSetting } from "@/lib/settings";

/** کلید تنظیمی سوئیچ نمایش کدها (در پنل سوپرادمین، بخش پیامک) */
export const SHOW_SENT_CODES_KEY = "sms.show_sent_codes";

/**
 * آیا کد ارسال‌شده (پیامک یا ایمیل) می‌تواند در صفحه ورود نمایش داده شود؟
 *
 * - در محیط توسعه همیشه بله (رفتار قبلی حفظ شده است).
 * - در پروداکشن فقط وقتی سوپرادمین سوئیچ «نمایش کدهای ارسالی» را روشن کرده باشد؛
 *   با روشن‌کردن آن، کد دوباره مثل قبل روی صفحهٔ ورود دیده می‌شود.
 *
 * هشدار: این قابلیت راه‌آهن تست است و در سرویس واقعی باید خاموش بماند،
 * چون هر کسی که صفحهٔ ورود را باز کند می‌تواند کد تأیید را ببیند.
 */
export async function canShowSentCodes(): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return true;
  const raw = await getSetting(SHOW_SENT_CODES_KEY);
  return (raw ?? "false").trim().toLowerCase() === "true";
}
