/**
 * ابزارهای کمکی مشترک
 */

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** ترکیب کلاس‌های tailwind */
export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

/**
 * خطای HTTP با کد وضعیت.
 * در لایهٔ منطق تجاری پرتاب می‌شود و `apiError` آن را به پاسخ JSON نگاشت می‌کند.
 */
export function httpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/** پاسخ JSON استاندارد برای Route Handlers */
export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

/**
 * خطاهای کنترلی Next (مثل لغو prerender هنگام دسترسی به cookies()/headers()).
 * این خطاها نشانهٔ «این مسیر داینامیک است» هستند و نباید به پاسخ JSON تبدیل
 * شوند؛ باید به Next برگردانده شوند تا رندر به زمان درخواست موکول شود.
 * بلعیدن آن‌ها باعث شکست `next build` در حالت Cache Components می‌شود.
 */
export function isNextControlledError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest === "HANGING_PROMISE_REJECTION" ||
    digest === "DYNAMIC_CODE_USAGE" ||
    digest === "NEXT_REDIRECT" ||
    digest === "NEXT_NOT_FOUND" ||
    digest === "CLIENT_HOOK_DYNAMIC"
  );
}

export function apiError(error: unknown) {
  // خطاهای کنترلی Next را دوباره پرتاب می‌کنیم (تبدیلشان به Response غلط است)
  if (isNextControlledError(error)) throw error;
  // خطاهای اعتبارسنجی Zod را به 400 نگاشت می‌کنیم
  let status = (error as { status?: number })?.status ?? 500;
  let message = error instanceof Error ? error.message : "خطای ناشناخته";
  const zod = (error as { name?: string; issues?: unknown }).name;
  if (zod === "ZodError") {
    status = 400;
    try {
      const issues = (error as { issues: { message: string }[] }).issues;
      message = issues.map((i) => i.message).join("؛ ");
    } catch {
      /* ignore */
    }
  }
  // ثبت خطاهای سرور برای پایش (گزارش خطا)
  if (status >= 500) {
    import("@/lib/monitoring").then((m) => m.reportError(error, { status })).catch(() => {});
  }
  return json({ success: false, error: message }, { status });
}

/** تبدیل عدد به فرمت تومان با جداکننده هزارگان */
export function formatToman(amount: number): string {
  return new Intl.NumberFormat("fa-IR").format(amount) + " تومان";
}

/** تبدیل تاریخ به شمسی (فقط نمایش) */
export function toJalali(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function toPersianDigits(input: string | number): string {
  const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(input).replace(/\d/g, (d) => fa[Number(d)]);
}
