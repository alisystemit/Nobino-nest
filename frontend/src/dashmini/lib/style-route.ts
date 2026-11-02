/**
 * نگاشت مسیرهای داشبورد کلاسیک به داشبورد مینی‌استایل.
 * فقط برای این نوشته شده که وقتی سوپرادمین سبک را «mini» انتخاب می‌کند، لینک‌های
 * قدیمی (منوی کناری، دکمه‌های بیرونی، بوک‌مارک‌ها) به پوستهٔ تازه بروند — و هیچ
 * تغییری در جدول مسیرهای نسخهٔ وب ایجاد نشود.
 *
 * بی‌وابستگی این فایل عمدی است: App.tsx (باندل اولیه) آن را import می‌کند.
 */

/** مسیرهایی که در نسخهٔ مینی ساخته نشده‌اند یا تمام‌صفحه‌اند و نباید جابه‌جا شوند */
const NOT_MAPPED = new Set(["/dashboard/setup"]);

const MAP: Record<string, string> = {
  "/dashboard": "/dash",
  "/dashboard/appointments": "/dash/appointments",
  "/dashboard/new-appointment": "/dash/booking",
  "/dashboard/voice-booking": "/dash/voice-booking",
  "/dashboard/customers": "/dash/customers",
  "/dashboard/staff": "/dash/staff",
  "/dashboard/salon": "/dash/salon",
  "/dashboard/settings": "/dash/settings",
  "/dashboard/management": "/dash/management",
  "/dashboard/wallet": "/dash/wallet",
  "/dashboard/commission": "/dash/commission",
  "/dashboard/account": "/dash/account",
};

/**
 * اگر مسیر کلاسیک معادل مینی داشته باشد، آدرس تازه (با کوئری‌استرینگ منتقل‌شده)
 * برمی‌گردد؛ در غیر این صورت null تا صفحهٔ وب همان‌جا رندر شود.
 */
export function miniStylePath(pathname: string, search: string): string | null {
  if (NOT_MAPPED.has(pathname)) return null;
  const base = MAP[pathname];
  if (!base) return null;
  // ?new=1 یعنی «ساخت سالن» → ویزارد تمام‌صفحهٔ وب بماند
  const params = new URLSearchParams(search);
  if (params.has("new")) return null;
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
