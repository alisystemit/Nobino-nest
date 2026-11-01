"use client";

import { useEffect, useState } from "react";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";

type Slot = { startAt: string; endAt: string };

function todayISO(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatDateLabel(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(new Date(`${iso}T12:00:00Z`));
  } catch {
    return iso;
  }
}

function formatTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/**
 * دیالوگ جابه‌جایی نوبت با نمایش زمان‌های واقعاً آزاد (بر اساس موتور availability).
 */
export default function RescheduleModal({
  appointmentId,
  salonSlug,
  serviceId,
  employeeId,
  branchId,
  timezone = "Asia/Tehran",
  onClose,
  onDone,
}: {
  appointmentId: string;
  salonSlug: string | null | undefined;
  serviceId: string | null | undefined;
  employeeId?: string | null;
  branchId?: string | null;
  timezone?: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const tz = timezone || "Asia/Tehran";
  const [date, setDate] = useState(todayISO(tz));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!salonSlug || !serviceId || !date) {
        setSlots([]);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const q = new URLSearchParams({ serviceId, date });
        if (employeeId) q.set("employeeId", employeeId);
        if (branchId) q.set("branchId", branchId);
        const res = await fetch(`/api/salons/${salonSlug}/availability?${q}`);
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) throw new Error(data.error || "خطا در دریافت زمان‌ها");
        setSlots(data.slots ?? []);
      } catch (e) {
        if (!cancelled) {
          setSlots([]);
          setError(e instanceof Error ? e.message : "خطا در دریافت زمان‌های آزاد");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [salonSlug, serviceId, date, employeeId, branchId]);

  async function choose(startAt: string) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "تغییر زمان ناموفق بود");
      onDone(`نوبت به ${formatTime(startAt, tz)} تغییر کرد.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="تغییر زمان نوبت">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-neutral-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[90vh] sm:rounded-3xl sm:p-5 sm:pb-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-200 sm:hidden dark:bg-neutral-700" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-neutral-900 dark:text-neutral-100">تغییر زمان نوبت</h2>
            <p className="mt-1 text-xs text-neutral-500">فقط زمان‌های واقعاً آزاد نمایش داده می‌شوند.</p>
          </div>
          <button onClick={onClose} className="flex h-10 shrink-0 items-center rounded-xl bg-neutral-100 px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300" aria-label="بستن">
            بستن ✕
          </button>
        </div>

        {!serviceId || !salonSlug ? (
          <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            برای این نوبت خدمت/سالن ثبت نشده است؛ تغییر زمان از این صفحه ممکن نیست. با سالن تماس بگیرید.
          </p>
        ) : (
          <>
            <label className="mt-5 block text-xs font-bold text-neutral-600 dark:text-neutral-300">تاریخ جدید (شمسی)</label>
            <JalaliDatePicker
              className="mt-1"
              value={date}
              onChange={setDate}
              min={todayISO(tz)}
              timeZone={tz}
            />
            <p className="mt-1 text-[11px] text-neutral-400">{formatDateLabel(date, tz)}</p>

            {loading ? (
              <p className="mt-4 rounded-xl bg-neutral-50 py-6 text-center text-sm text-neutral-400 dark:bg-neutral-800">
                در حال بررسی زمان‌های آزاد...
              </p>
            ) : slots.length === 0 ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                در این روز زمان آزادی وجود ندارد. تاریخ دیگری را انتخاب کنید.
              </p>
            ) : (
              <div className="mt-3 grid max-h-[45dvh] grid-cols-3 gap-2 overflow-y-auto sm:max-h-64 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s.startAt}
                    onClick={() => choose(s.startAt)}
                    disabled={saving}
                    className="flex h-11 items-center justify-center rounded-xl border border-neutral-200 bg-white text-sm font-bold tabular-nums text-neutral-700 transition hover:border-pink-300 hover:bg-pink-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    {formatTime(s.startAt, tz)}
                  </button>
                ))}
              </div>
            )}

            {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}
            {saving && <p className="mt-3 text-center text-xs text-neutral-500">در حال ثبت تغییر...</p>}
          </>
        )}
      </div>
    </div>
  );
}
