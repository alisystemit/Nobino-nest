"use client";

import Link from "@/router-shim";
import { Check, Clock, MoreVertical, Phone, Star } from "lucide-react";
import {
  CHANNEL_META,
  durationMin,
  faDuration,
  isDone,
  money,
  statusMeta,
  timeIn,
  tzOf,
  untilLabel,
  type AgendaItem,
} from "@/lib/appointments/agenda-view";
import { toPersianDigits } from "@/lib/utils";

type Props = {
  item: AgendaItem;
  /** منطقهٔ زمانی صفحه؛ ساعت هر نوبت با منطقهٔ زمانی سالن خودش نمایش داده می‌شود */
  timezone: string;
  role: string;
  nowMs: number;
  busy?: boolean;
  /** نوار «نوبت بعدی» یا «در حال انجام» — کارت برجسته می‌شود */
  highlight?: "next" | "live" | null;
  /** نمایش نام سالن برای ادمین/نماینده و روزهای چندسالنه */
  showSalon?: boolean;
  onStatus: (status: "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED") => void;
  onSheet: () => void;
};

/**
 * کارت یک نوبت — برای نگاه سریع با یک انگشت روی گوشی:
 * ساعت درشت، نام، خدمت/آرایشگر، و دو دکمهٔ اصلی بدون باز کردن صفحهٔ دیگر.
 */
export default function AppointmentCard({ item, timezone, role, nowMs, busy, highlight, showSalon, onStatus, onSheet }: Props) {
  const tz = tzOf(item, timezone);
  const meta = statusMeta(item.status);
  const channel = CHANNEL_META[item.channel];
  const startMs = new Date(item.startAt).getTime();
  const past = startMs < nowMs && !isDone(item.status);
  const staff = role !== "CUSTOMER";
  const dim = item.status === "CANCELLED" || item.status === "NO_SHOW";

  const ring =
    highlight === "live"
      ? "border-pink-400 bg-pink-50/70 dark:border-pink-700 dark:bg-pink-950/30"
      : highlight === "next"
        ? "border-[#1c2434] dark:border-pink-700"
        : "border-neutral-200 dark:border-neutral-800";

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-white p-3 shadow-sm transition dark:bg-neutral-900 ${ring} ${dim ? "opacity-70" : ""}`}
      data-status={item.status}
    >
      {/* نوار رنگی وضعیت — شناسایی سریع بدون خواندن متن */}
      <span className={`absolute inset-y-0 right-0 w-1 ${meta.bar}`} aria-hidden />

      <div className="flex items-start gap-3 pr-1">
        {/* ستون ساعت */}
        <div className="w-16 shrink-0 text-center">
          <div className="text-lg leading-tight font-black text-neutral-900 dark:text-neutral-50" dir="rtl">
            {timeIn(item.startAt, tz)}
          </div>
          <div className="mt-0.5 text-[11px] text-neutral-400">تا {timeIn(item.endAt, tz)}</div>
          {durationMin(item) > 0 && <div className="text-[10px] text-neutral-400">{faDuration(durationMin(item))}</div>}
          {highlight === "live" ? (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-pink-600 px-2 py-0.5 text-[10px] font-black text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> الان
            </span>
          ) : (
            !isDone(item.status) && (
              <span className={`mt-1 block text-[10px] font-bold ${past ? "text-neutral-400" : "text-pink-600 dark:text-pink-400"}`}>
                {untilLabel(item.startAt, nowMs)}
              </span>
            )
          )}
        </div>

        {/* ستون اطلاعات */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate text-[15px] font-black text-neutral-900 dark:text-neutral-50">{item.customerName}</h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}>{meta.label}</span>
          </div>

          <p className="mt-0.5 truncate text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            {item.service ?? "بدون خدمت"}
            {item.employee ? ` · ${item.employee}` : ""}
            {showSalon && item.salonName ? ` · ${item.salonName}` : ""}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            <a href={`tel:${item.customerPhone}`} dir="ltr" className="-mx-1 -my-1 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 font-bold text-neutral-500 transition hover:bg-neutral-100 hover:text-pink-600 dark:text-neutral-400 dark:hover:bg-neutral-800">
              <Phone className="h-3 w-3" />
              {toPersianDigits(item.customerPhone)}
            </a>
            {item.servicePrice ? <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{money(item.servicePrice)}</span> : null}
            {item.depositAmount ? (
              <span className={item.depositPaid ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                بیعانه {new Intl.NumberFormat("fa-IR").format(item.depositAmount)} {item.depositPaid ? "✓" : "پرداخت‌نشده"}
              </span>
            ) : null}
            {channel && <span>{channel.icon} {channel.label}</span>}
            {item.note && <span className="truncate">📝 {item.note}</span>}
          </div>
        </div>
      </div>

      {/* ردیف عملیات — ارتفاع لمسی حداقل ۴۴px */}
      <div className="mt-2.5 flex items-center gap-2">
        {staff ? (
          <>
            {item.status === "REQUESTED" && (
              <Action onClick={() => onStatus("CONFIRMED")} busy={busy} tone="emerald" label="تأیید نوبت" short="تأیید" icon={<Check className="h-4 w-4" />} />
            )}
            {(item.status === "CONFIRMED" || item.status === "REQUESTED") && (
              <Action onClick={() => onStatus("COMPLETED")} busy={busy} tone="sky" label="انجام شد" short="انجام شد" icon={<Check className="h-4 w-4" />} />
            )}
            {isDone(item.status) && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                <Clock className="h-3.5 w-3.5" /> وضعیت نهایی ثبت شد
              </span>
            )}
          </>
        ) : (
          <>
            {(item.status === "REQUESTED" || item.status === "CONFIRMED") && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                {meta.label}
              </span>
            )}
            {item.salonSlug && (
              <Link
                href={`/s/${item.salonSlug}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-pink-50 px-3 py-2 text-xs font-bold text-pink-600 transition hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-300"
              >
                صفحه سالن
              </Link>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onSheet}
          className="mr-auto inline-flex h-11 min-w-11 items-center justify-center rounded-xl border border-neutral-200 px-3 text-xs font-bold text-neutral-600 transition active:scale-95 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          aria-label="کارهای بیشتر"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

const tones = {
  emerald: "bg-emerald-600 text-white hover:bg-emerald-700",
  sky: "bg-sky-600 text-white hover:bg-sky-700",
  amber: "bg-amber-500 text-white hover:bg-amber-600",
  neutral: "bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100",
} as const;

function Action({
  onClick,
  busy,
  tone,
  short,
  label,
  icon,
}: {
  onClick: () => void;
  busy?: boolean;
  tone: keyof typeof tones;
  short: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      className={`inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-black transition active:scale-[0.98] disabled:opacity-60 ${tones[tone]}`}
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : icon}
      {short}
    </button>
  );
}
