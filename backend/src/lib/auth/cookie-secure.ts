/**
 * آیا کوکی نشست باید پرچم `Secure` بگیرد؟ (تابع خالص — بدون وابستگی به Next)
 *
 * پرچم Secure باعث می‌شود مرورگر کوکی را روی HTTP ذخیره نکند؛ اگر سایت پشت
 * پروکس HTTP (مثلاً Apache روی پورت ۸۰۸۰) اجرا شود، ورود «موفق» برمی‌گردد ولی
 * نشست هرگز ساخته نمی‌شود. ترتیب تصمیم:
 *   ۱) `AUTH_COOKIE_SECURE=true|false` — تصمیم صریح مدیر سرور
 *   ۲) پروتکل اعلام‌شده توسط پروکس (`X-Forwarded-Proto` و معادل‌ها) — خودکار
 *   ۳) رفتار پیش‌فرض: در پروداکشن Secure، در توسعه آزاد
 */
export function resolveCookieSecure(opts: {
  flag?: string | null;
  proto?: string | null;
  nodeEnv?: string;
}): boolean {
  const flag = (opts.flag ?? "").trim().toLowerCase();
  if (flag === "true" || flag === "1" || flag === "yes") return true;
  if (flag === "false" || flag === "0" || flag === "no") return false;

  const proto = (opts.proto ?? "").split(",")[0].trim().toLowerCase();
  if (proto === "https" || proto === "ssl") return true;
  if (proto === "http") return false;

  return (opts.nodeEnv ?? "production") === "production";
}
