/**
 * محدودساز نرخ سبک (fixed-window) برای هندلرهای Route که بیرون از چرخهٔ DI
 * نکست اجرا می‌شوند و نمی‌توانند `RateLimitMiddlewareService` تزریقی را بگیرند.
 *
 * دقت: کش درون‌فرایندی است؛ در PM2 با یک پروسه (fork) رفتار درست است و در
 * مقیاس چندپروسه‌ای صرفاً تخمینی عمل می‌کند (خطای امنیتی حساسی ندارد).
 */
import { getSetting } from "@/lib/settings";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateCheck = { ok: boolean; retryAfterSec: number };

export function checkRate(key: string, limit: number, windowMs: number): RateCheck {
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || hit.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, retryAfterSec: 0 };
  }
  if (hit.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)) };
  }
  hit.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

/**
 * IP مشتری از هدرهای پروکسی (nginx جلوی اپ است).
 * ترتیب عمداً معکوسِ «اولین ورودی XFF» است: nginx با proxy_add_x_forwarded_for
 * آدرس واقعی را به انتهای لیست اضافه می‌کند و ورودی‌های ابتدای لیست را
 * کلاینت می‌تواند جعل کند. X-Real-IP (که nginx بازنویسی می‌کند) امن‌ترین است.
 */
export function clientIpFromRequest(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

/**
 * سقف عددی از تنظیمات سراسری (Setting KV) و در نبودش از متغیر محیطی؛
 * مقدار ۰ به معنی «بدون سقف» و مقدار منفی/نامعتبر = fallback است
 * (تا «تنظیم اشتباه» بی‌صدا محدودساز را خاموش نکند).
 */
export async function numericSettingOrEnv(settingKey: string, envValue: string | undefined, fallback: number): Promise<number> {
  const raw = await getSetting(settingKey).catch(() => undefined);
  const settingTxt = String(raw ?? "").trim();
  if (settingTxt !== "" && Number.isFinite(Number(settingTxt)) && Number(settingTxt) >= 0) return Number(settingTxt);
  // نکته: Number("") برابر صفر است، پس متغیر محیطی خالی باید صریح رد شود؛
  // وگرنه «تنظیم‌نشده» با «سقف صفر = بدون سقف» اشتباه گرفته می‌شود و محدود‌ساز
  // بی‌صدا خاموش می‌ماند.
  const envTxt = String(envValue ?? "").trim();
  if (envTxt !== "" && Number.isFinite(Number(envTxt)) && Number(envTxt) >= 0) return Number(envTxt);
  return fallback;
}

/** پاسخ ۴۲۹ استاندارد با هدر Retry-After */
export function tooManyRequests(retryAfterSec: number, message: string) {
  return Response.json(
    { success: false, error: message, retryAfterSec },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}
