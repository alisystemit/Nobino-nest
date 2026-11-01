"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import {
  JALALI_MONTHS,
  WEEKDAYS_SHORT,
  isoToJalali,
  jalaliMonthDays,
  jalaliToGregorian,
  jalaliToIso,
  toPersianDigits,
  weekdayIndexSaturdayFirst,
} from "@/lib/time/jalali";
import { todayInZone } from "@/lib/time/zoned";

const MOBILE_QUERY = "(max-width: 639px)";

function subscribeMobile(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

type Props = {
  /** تاریخ میلادی به شکل YYYY-MM-DD (همان چیزی که به API می‌رود) */
  value: string;
  onChange: (iso: string) => void;
  /** کمینه/بیشینه به شکل میلادی YYYY-MM-DD */
  min?: string;
  max?: string;
  label?: string;
  placeholder?: string;
  /** کلاس خودِ دکمهٔ فیلد (برای هم‌اندازه شدن با بقیهٔ فرم) */
  className?: string;
  /** «امروز» به ساعت سالن؛ اگر ندهید از منطقهٔ زمانی مرورگر خوانده می‌شود */
  timeZone?: string | null;
  disabled?: boolean;
  id?: string;
};

/**
 * تقویم هجری شمسی — جایگزین `<input type="date">` که تقویم میلادی نشان می‌داد.
 * مقدارِ ذخیره‌شده همچنان میلادی (ISO) است؛ فقط نمایش و انتخاب شمسی و با ارقام فارسی.
 *
 * روی گوشی به شکل «شیت پایین» تمام‌عرض باز می‌شود (سلول‌های ۴۴px برای لمس) و روی
 * دسکتاپ همان پاپ‌اور کنار فیلد است. پاپ‌اور با پرتال‌مانند `fixed` روی موبایل از
 * بریده‌شدن داخل کارت‌های overflow-hidden جلوگیری می‌کند.
 */
export default function JalaliDatePicker({
  value,
  onChange,
  min,
  max,
  label,
  placeholder = "انتخاب تاریخ",
  className = "",
  timeZone,
  disabled = false,
  id,
}: Props) {
  const today = useMemo(() => todayInZone(timeZone), [timeZone]);
  const selected = isoToJalali(value);
  const todayJ = isoToJalali(today);

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ jy: number; jm: number }>(() => {
    const base = selected ?? todayJ ?? { jy: 1405, jm: 1, jd: 1 };
    return { jy: base.jy, jm: base.jm };
  });
  const boxRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  // اندازهٔ صفحه از سیستم بیرونی خوانده می‌شود؛ بدون setState داخل effect
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, getServerSnapshot);

  // پاپ‌اور دسکتاپ روی body پورتال می‌شود؛ مختصاتش از خود فیلد گرفته می‌شود
  function anchor() {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 328;
    const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 8, left });
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // روی دسکتاپ (بدون پس‌زمینه) کلیک بیرون = بستن
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    // روی دسکتاپ با اسکرول، پاپ‌اور جای خود را گم می‌کند؛ بسته شود
    const onScroll = () => {
      if (!isMobile) setOpen(false);
    };
    const onResize = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = 328;
      setPos({ top: r.bottom + 8, left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8)) });
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, isMobile]);

  function openCalendar() {
    if (disabled) return;
    const base = isoToJalali(value) ?? todayJ ?? { jy: 1405, jm: 1, jd: 1 };
    setView({ jy: base.jy, jm: base.jm });
    anchor();
    setOpen((v) => !v);
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const total = v.jy * 12 + (v.jm - 1) + delta;
      return { jy: Math.floor(total / 12), jm: (total % 12) + 1 };
    });
  }

  function shiftYear(delta: number) {
    setView((v) => ({ jy: v.jy + delta, jm: v.jm }));
  }

  const days = jalaliMonthDays(view.jy, view.jm);
  const firstG = jalaliToGregorian(view.jy, view.jm, 1);
  const lead = weekdayIndexSaturdayFirst(firstG.gy, firstG.gm, firstG.gd);

  function dayIso(jd: number): string {
    return jalaliToIso(view.jy, view.jm, jd);
  }

  function isDisabled(iso: string): boolean {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  function pick(iso: string) {
    if (isDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
  }

  const navBtn =
    "flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-500 shadow-sm transition hover:border-pink-300 hover:text-pink-600 active:scale-95 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-pink-700 dark:hover:text-pink-300";

  return (
    <div className="relative" ref={boxRef}>
      {label && (
        <span className="mb-1 block text-[11px] font-black text-neutral-500 dark:text-neutral-400">{label}</span>
      )}
      <button
        id={id}
        type="button"
        onClick={openCalendar}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `${label} — تقویم شمسی` : "تقویم شمسی"}
        className={`flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-100 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-pink-600 dark:focus:ring-pink-900/40 ${value ? "font-bold text-neutral-800 dark:text-neutral-100" : "text-neutral-400 dark:text-neutral-500"} ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="truncate">{value ? formatShown(value) : placeholder}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-neutral-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        createPortal(
          <>
          {/* پس‌زمینهٔ شیت فقط روی گوشی */}
          {isMobile && (
            <div className="fixed inset-0 z-[74] bg-black/45 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          )}
          <div
            ref={panelRef}
            role="dialog"
            aria-modal={isMobile}
            aria-label="انتخاب تاریخ شمسی"
            style={isMobile ? undefined : { top: pos.top, left: pos.left }}
            className={`fixed z-[75] overflow-y-auto border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 ${
              isMobile
                ? "inset-x-0 bottom-0 max-h-[88dvh] w-full rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
                : "max-h-[70vh] w-[20.5rem] rounded-2xl p-3"
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => shiftYear(-1)} aria-label="سال قبل" className={navBtn}>
                  <ChevronsRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => shiftMonth(-1)} aria-label="ماه قبل" className={navBtn}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="text-center">
                <p className="text-base font-black text-neutral-900 dark:text-neutral-50">
                  {JALALI_MONTHS[view.jm - 1]} {toPersianDigits(view.jy)}
                </p>
                <p className="mt-0.5 text-[10px] font-bold text-neutral-400">تقویم هجری شمسی</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => shiftMonth(1)} aria-label="ماه بعد" className={navBtn}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => shiftYear(1)} aria-label="سال بعد" className={navBtn}>
                  <ChevronsLeft className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center" role="grid">
              {WEEKDAYS_SHORT.map((d) => (
                <span key={d} className="py-1 text-[10px] font-black text-neutral-400 dark:text-neutral-500" role="columnheader">
                  {d}
                </span>
              ))}
              {Array.from({ length: lead }).map((_, i) => (
                <span key={`lead-${i}`} aria-hidden />
              ))}
              {Array.from({ length: days }).map((_, i) => {
                const jd = i + 1;
                const iso = dayIso(jd);
                const isSel = selected?.jy === view.jy && selected?.jm === view.jm && selected?.jd === jd;
                const isToday = iso === today;
                const off = isDisabled(iso);
                return (
                  <button
                    key={jd}
                    type="button"
                    onClick={() => pick(iso)}
                    disabled={off}
                    aria-label={`${jd} ${JALALI_MONTHS[view.jm - 1]} ${view.jy}`}
                    aria-pressed={isSel}
                    className={`flex h-11 items-center justify-center rounded-xl text-sm transition active:scale-95 sm:h-9 ${
                      isSel
                        ? "bg-gradient-to-l from-pink-600 to-purple-600 font-black text-white shadow-md shadow-pink-500/30"
                        : off
                          ? "cursor-not-allowed text-neutral-300 dark:text-neutral-600"
                          : isToday
                            ? "bg-pink-50 font-black text-pink-700 ring-1 ring-pink-200 hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-300 dark:ring-pink-800"
                            : "font-semibold text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {toPersianDigits(jd)}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => pick(today)}
                disabled={isDisabled(today)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-pink-50 px-3 text-xs font-black text-pink-700 transition hover:bg-pink-100 disabled:opacity-40 dark:bg-pink-900/30 dark:text-pink-300 dark:hover:bg-pink-900/50"
              >
                <CalendarDays className="h-4 w-4" />
                امروز
                {todayJ && (
                  <span className="font-bold text-pink-500/80 dark:text-pink-300/70">
                    {toPersianDigits(`${todayJ.jd} ${JALALI_MONTHS[todayJ.jm - 1]}`)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="بستن تقویم"
                className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                بستن
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          </>,
          document.body
        )}
    </div>
  );
}

/** نمایش تاریخ انتخاب‌شده در دکمه: «سه‌شنبه ۶ آبان ۱۴۰۵» */
function formatShown(iso: string): string {
  const j = isoToJalali(iso);
  if (!j) return "";
  return toPersianDigits(`${weekdayOf(iso)} ${j.jd} ${JALALI_MONTHS[j.jm - 1]} ${j.jy}`);
}

function weekdayOf(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { weekday: "long" }).format(new Date(`${iso}T12:00:00Z`));
  } catch {
    return "";
  }
}
