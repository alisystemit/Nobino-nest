"use client";

import { useEffect, useState } from "react";
import { Ban, CalendarClock, Check, MessageSquare, Phone, Store, UserX } from "lucide-react";
import { isDone, statusMeta, timeIn, tzOf, type AgendaItem } from "@/lib/appointments/agenda-view";
import { toPersianDigits } from "@/lib/utils";

type Props = {
  item: AgendaItem;
  timezone: string;
  role: string;
  busy?: boolean;
  onClose: () => void;
  onStatus: (status: "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED", reason?: string) => void;
  onReschedule: () => void;
  /** لغو توسط خود مشتری (مسیر/قوانین متفاوت دارد) */
  onCustomerCancel: (reason: string) => void;
};

/**
 * شیت عملیات پایین‌صفحه — روی گوشی همهٔ کارهای کم‌ترتکرار یک نوبت بدون
 * رفتن به صفحهٔ دیگر و با ارتفاع لمسی مناسب انگشت شست.
 */
export default function ActionSheet({ item, timezone, role, busy, onClose, onStatus, onReschedule, onCustomerCancel }: Props) {
  const [step, setStep] = useState<"menu" | "cancel">("menu");
  const [reason, setReason] = useState("");
  const staff = role !== "CUSTOMER";
  const tz = tzOf(item, timezone);
  const meta = statusMeta(item.status);
  const terminal = isDone(item.status);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const row =
    "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 active:scale-[0.99] dark:text-neutral-200 dark:hover:bg-neutral-800";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`کارهای نوبت ${item.customerName}`}>
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-label="بستن" />

      <div className="animate-fade-up relative w-full max-w-md rounded-t-3xl border border-neutral-200 bg-white p-4 pb-8 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 sm:rounded-3xl sm:pb-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700 sm:hidden" aria-hidden />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-neutral-900 dark:text-neutral-50">{item.customerName}</h3>
            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
              {timeIn(item.startAt, tz)} تا {timeIn(item.endAt, tz)} · {item.service ?? "بدون خدمت"}
              {item.employee ? ` · ${item.employee}` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.chip}`}>{meta.label}</span>
        </div>

        {item.note && (
          <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">📝 {item.note}</p>
        )}

        {step === "cancel" ? (
          <div className="mt-4">
            <label htmlFor="cancel-reason" className="block text-xs font-bold text-neutral-500 dark:text-neutral-400">
              دلیل لغو (اختیاری — برای مشتری پیامک می‌شود)
            </label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="مثلاً: آرایشگر مرخصی است"
              className="mt-1 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => (staff ? onStatus("CANCELLED", reason.trim() || undefined) : onCustomerCancel(reason.trim()))}
                className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                ثبت لغو نوبت
              </button>
              <button type="button" onClick={() => setStep("menu")} className="h-11 rounded-xl bg-neutral-100 px-4 text-sm font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                بازگشت
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-1.5">
            <div className="flex gap-2">
              <a href={`tel:${item.customerPhone}`} className="h-11 flex-1 rounded-xl bg-neutral-100 text-center text-sm font-bold text-neutral-700 transition active:scale-[0.98] dark:bg-neutral-800 dark:text-neutral-200" dir="ltr">
                <Phone className="ml-1 inline h-4 w-4" /> {toPersianDigits(item.customerPhone)}
              </a>
              <a href={`sms:${item.customerPhone}`} className="h-11 rounded-xl bg-neutral-100 px-3 text-sm font-bold text-neutral-700 transition active:scale-[0.98] dark:bg-neutral-800 dark:text-neutral-200" aria-label="پیامک به مشتری">
                <MessageSquare className="h-4 w-4" />
              </a>
            </div>

            {!terminal && (
              <button type="button" onClick={onReschedule} className={row}>
                <CalendarClock className="h-5 w-5 text-amber-600" /> جابه‌جایی به ساعت دیگری
              </button>
            )}

            {staff ? (
              <>
                {item.status === "REQUESTED" && (
                  <button type="button" onClick={() => onStatus("CONFIRMED")} className={row}>
                    <Check className="h-5 w-5 text-emerald-600" /> تأیید نوبت
                  </button>
                )}
                {!terminal && (
                  <button type="button" onClick={() => onStatus("COMPLETED")} className={row}>
                    <Check className="h-5 w-5 text-sky-600" /> انجام شد
                  </button>
                )}
                {!terminal && (
                  <button type="button" onClick={() => onStatus("NO_SHOW")} className={row}>
                    <UserX className="h-5 w-5 text-neutral-500" /> مراجعه نکرد
                  </button>
                )}
                {!terminal && (
                  <button type="button" onClick={() => setStep("cancel")} className={row}>
                    <Ban className="h-5 w-5 text-red-600" /> لغو نوبت
                  </button>
                )}
              </>
            ) : (
              <>
                {(item.status === "REQUESTED" || item.status === "CONFIRMED") && (
                  <button type="button" onClick={() => setStep("cancel")} className={row}>
                    <Ban className="h-5 w-5 text-red-600" /> لغو این نوبت
                  </button>
                )}
                {item.salonSlug && (
                  <a href={`/s/${item.salonSlug}`} className={row}>
                    <Store className="h-5 w-5 text-pink-600" /> صفحهٔ سالن و رزرو مجدد
                  </a>
                )}
              </>
            )}

            <button type="button" onClick={onClose} className="mt-2 h-11 w-full rounded-xl border border-neutral-200 text-sm font-bold text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              بستن
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
