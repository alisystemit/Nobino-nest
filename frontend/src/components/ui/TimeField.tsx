"use client";

import { ChevronDown, Clock } from "lucide-react";
import { toPersianDigits } from "@/lib/time/jalali";

type Props = {
  /** "HH:MM" (لاتین، همان چیزی که فرم‌ها انتظار دارند) */
  value: string;
  onChange: (value: string) => void;
  /** بازهٔ ساعات قابل انتخاب (پیش‌فرض ۸ تا ۲۳) */
  from?: number;
  to?: number;
  /** گام دقیقه (پیش‌فرض ۵) */
  step?: number;
  className?: string;
  disabled?: boolean;
  label?: string;
};

const selectCls =
  "h-11 w-full min-w-0 appearance-none rounded-xl border border-neutral-200 bg-white px-3 text-center text-sm font-bold text-neutral-800 shadow-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-pink-600 dark:focus:ring-pink-900/40";

/**
 * انتخاب ساعت با ارقام فارسی — جایگزین `<input type="time">` که ساعت را با ارقام
 * لاتین نشان می‌داد. مقدار خروجی "HH:MM" لاتین است تا همان قرارداد قبلی حفظ شود.
 * ارتفاع هر انتخابگر ۴۴px است تا روی گوشی راحت لمس شود و با تقویم شمسی هم‌اندازه بماند.
 */
export default function TimeField({
  value,
  onChange,
  from = 8,
  to = 23,
  step = 5,
  className = "",
  disabled = false,
  label,
}: Props) {
  const [hourPart = "", minutePart = ""] = value ? value.split(":") : ["", ""];
  const hours = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  const minutes = Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step);
  const currentMinute = Number(minutePart);
  if (minutePart && !minutes.includes(currentMinute)) minutes.push(currentMinute);
  minutes.sort((a, b) => a - b);

  function setHour(h: string) {
    const m = minutePart || String(minutes[0]).padStart(2, "0");
    onChange(h ? `${h.padStart(2, "0")}:${m}` : "");
  }

  function setMinute(m: string) {
    const h = hourPart || String(from).padStart(2, "0");
    onChange(m ? `${h}:${m.padStart(2, "0")}` : "");
  }

  return (
    <div className={className}>
      {label && (
        <span className="mb-1 flex items-center gap-1 text-[11px] font-black text-neutral-500 dark:text-neutral-400">
          <Clock className="h-3.5 w-3.5 text-pink-500" />
          {label}
        </span>
      )}
      <div className="flex items-center gap-1.5" dir="ltr">
        <div className="relative min-w-0 flex-1">
          <select
            value={hourPart}
            onChange={(e) => setHour(e.target.value)}
            disabled={disabled}
            aria-label="ساعت"
            className={selectCls}
          >
            <option value="">ساعت</option>
            {hours.map((h) => (
              <option key={h} value={String(h).padStart(2, "0")}>
                {toPersianDigits(String(h).padStart(2, "0"))}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        </div>
        <span className="flex h-11 w-4 shrink-0 items-center justify-center text-lg font-black text-neutral-300 dark:text-neutral-600">:</span>
        <div className="relative min-w-0 flex-1">
          <select
            value={minutePart}
            onChange={(e) => setMinute(e.target.value)}
            disabled={disabled}
            aria-label="دقیقه"
            className={selectCls}
          >
            <option value="">دقیقه</option>
            {minutes.map((m) => (
              <option key={m} value={String(m).padStart(2, "0")}>
                {toPersianDigits(String(m).padStart(2, "0"))}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
        </div>
      </div>
    </div>
  );
}
