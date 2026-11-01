import { settingOrEnv } from "@/lib/settings";
import { json } from "@/lib/utils";

/**
 * محافظت مسیرهای `/api/cron/*`.
 *
 * کلید قبلاً فقط از `process.env.CRON_SECRET` خوانده می‌شد (و در زمان import
 * قفل می‌شد)؛ حالا ترتیب اولویت مثل بقیهٔ تنظیمات است:
 *
 *   تنظیم پویای `cron.secret` از پنل سوپرادمین ← متغیر محیطی CRON_SECRET
 *
 * توجه: اگر از پنل کلید تازه‌ای گذاشتید، اسکریپت کران بیرونی (جانشین Vercel Cron)
 * هم باید همان مقدار را در هدر `Authorization: Bearer …` بفرستد.
 */
export async function cronSecret(): Promise<string> {
  const value = await settingOrEnv("cron.secret", process.env.CRON_SECRET);
  return (value ?? "").trim();
}

/**
 * اگر درخواست مجاز نبود یک پاسخ 401 برگردانده می‌شود و در غیر این صورت null.
 * مصرف: `const denied = await requireCronAuth(req); if (denied) return denied;`
 */
export async function requireCronAuth(req: Request): Promise<Response | null> {
  const secret = await cronSecret();
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
