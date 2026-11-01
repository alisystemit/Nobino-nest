/**
 * ابزارهای کمکی مشترک (نسخه کلاینت — بدون json/apiError سمت سرور)
 */

import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** ترکیب کلاس‌های tailwind */
export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
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
