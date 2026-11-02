/**
 * «نسخهٔ وب این تب» — میان‌بُر موقت برای سوپرادمین/مالک که می‌خواهد یک‌بار پنل
 * کلاسیک را ببیند. تنها یک کلید sessionStorage است؛ سبک واقعی را تنظیم
 * سوپرادمین (dashboard.style و dashboard.style.salon.<id>) تعیین می‌کند.
 *
 * این فایل عمداً بی‌وابستگی است تا App.tsx (باندل اولیه) بدون کشیدن ماژول
 * داشبورد بتواند از آن استفاده کند.
 */
const CLASSIC_KEY = "nobino.dash.classic";

export function classicWanted(): boolean {
  try {
    return sessionStorage.getItem(CLASSIC_KEY) === "1";
  } catch {
    return false;
  }
}

export function requestClassic(): void {
  try {
    sessionStorage.setItem(CLASSIC_KEY, "1");
  } catch {
    /* بی‌اثر */
  }
}

export function leaveClassic(): void {
  try {
    sessionStorage.removeItem(CLASSIC_KEY);
  } catch {
    /* بی‌اثر */
  }
}
