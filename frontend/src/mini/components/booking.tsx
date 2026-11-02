/**
 * اجزای مسیر رزرو: انتخاب خدمت، آرایشگر، روز و ساعت.
 * همه کنترل‌شده (controlled) هستند تا حالت در صفحهٔ سالن بماند و با رفرش وب‌ویو
 * فقط «پیش‌نویس» در sessionStorage بازیابی شود.
 */
import type { MiniService, MiniSlot, MiniStaff } from "../lib/types";
import { dayLabel, duration, faDigits, relativeDayLabel, shortPrice, timeLabel, toman, weekdayLabel, ymd } from "../lib/format";
import { Icon } from "./ui";

/* ── خدمات ────────────────────────────────────────────────────────── */

export function ServicePicker({
  services,
  selected,
  showPrices,
  onToggle,
}: {
  services: MiniService[];
  selected: string[];
  showPrices: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      {services.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button key={s.id} type="button" className={`mini-option${on ? " is-on" : ""}`} onClick={() => onToggle(s.id)}>
            <span className="mini-check">
              <Icon name="check" size={13} />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="mini-option-title">{s.name}</span>
              <span className="mini-option-sub">
                {duration(s.durationMin)}
                {s.description ? ` · ${s.description}` : ""}
              </span>
            </span>
            {showPrices ? <span className="mini-option-price">{shortPrice(s.price)}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── آرایشگر ──────────────────────────────────────────────────────── */

export function StaffPicker({
  staff,
  value,
  onChange,
}: {
  staff: MiniStaff[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (!staff.length) return null;
  return (
    <div className="mini-avatars">
      <button type="button" className={`mini-pick${value === "" ? " is-on" : ""}`} onClick={() => onChange("")}>
        <div className="mini-avatar">
          <Icon name="sparkle" size={19} />
        </div>
        <b>هر کسی</b>
        <span>توافقی</span>
      </button>
      {staff.map((p) => (
        <button key={p.id} type="button" className={`mini-pick${value === p.id ? " is-on" : ""}`} onClick={() => onChange(p.id)}>
          <div className="mini-avatar">{p.avatarUrl ? <img src={p.avatarUrl} alt="" loading="lazy" /> : p.name.slice(0, 1)}</div>
          <b>{p.name}</b>
          <span>{p.title || (p.rating != null ? `${faDigits(Number(p.rating).toFixed(1))}★` : "آرایشگر")}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * آرایشگرهایی که همهٔ خدمات انتخاب‌شده را ارائه می‌دهند.
 * اگر برای آرایگر خدمتی تعریف نشده باشد، محدودیت لحاظ نمی‌شود (رفتار سرور).
 */
export function eligibleStaff(staff: MiniStaff[], serviceIds: string[]): MiniStaff[] {
  if (!serviceIds.length) return staff;
  return staff.filter((s) => s.serviceIds.length === 0 || serviceIds.every((id) => s.serviceIds.includes(id)));
}

/* ── روزها ────────────────────────────────────────────────────────── */

export function DayStrip({
  days,
  value,
  timezone,
  onChange,
}: {
  days: string[];
  value: string;
  timezone?: string;
  onChange: (day: string) => void;
}) {
  return (
    <div className="mini-days" role="tablist">
      {days.map((d) => (
        <button key={d} type="button" role="tab" aria-selected={value === d} className={`mini-day${value === d ? " is-on" : ""}`} onClick={() => onChange(d)}>
          <b>{dayLabel(d, timezone).split(" ")[0]}</b>
          <span>{relativeDayLabel(d, timezone)}</span>
        </button>
      ))}
    </div>
  );
}

/** فهرست n روز پیش‌رو از امروز (در منطقهٔ زمانی سالن) */
export function upcomingDays(count = 10, timezone = "Asia/Tehran"): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    out.push(ymd(d, timezone));
  }
  return out;
}

/* ── ساعت‌ها ──────────────────────────────────────────────────────── */

export function SlotGrid({
  slots,
  value,
  timezone,
  loading,
  emptyText = "برای این روز وقت خالی‌ای نیست.",
  onSelect,
}: {
  slots: MiniSlot[];
  value: string;
  timezone?: string;
  loading?: boolean;
  emptyText?: string;
  onSelect: (iso: string) => void;
}) {
  if (loading) {
    return (
      <div className="mini-slots" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="mini-skeleton" style={{ height: 42 }} />
        ))}
      </div>
    );
  }
  if (!slots.length) return <div className="mini-note">{emptyText}</div>;
  return (
    <div>
      <div className="mini-slots">
        {slots.map((s) => (
          <button key={s.startAt} type="button" className={`mini-slot${value === s.startAt ? " is-on" : ""}`} onClick={() => onSelect(s.startAt)}>
            {timeLabel(s.startAt, timezone)}
          </button>
        ))}
      </div>
      <div className="mini-option-sub" style={{ marginTop: 8 }}>
        {faDigits(slots.length)} وقت خالی · {weekdayLabel(slots[0] ? slots[0].startAt.slice(0, 10) : "", timezone)}
      </div>
    </div>
  );
}

/* ── خلاصهٔ انتخاب ────────────────────────────────────────────────── */

export function BookingSummary({
  services,
  price,
  minutes,
  when,
  staffName,
  showPrices,
}: {
  services: string[];
  price: number;
  minutes: number;
  when: string;
  staffName: string;
  showPrices: boolean;
}) {
  return (
    <div className="mini-card">
      <div className="mini-row">
        <span>خدمات</span>
        <span>{services.length ? services.join("، ") : "—"}</span>
      </div>
      {staffName ? (
        <div className="mini-row">
          <span>آرایشگر</span>
          <span>{staffName}</span>
        </div>
      ) : null}
      <div className="mini-row">
        <span>مدت</span>
        <span>{duration(minutes)}</span>
      </div>
      {showPrices ? (
        <div className="mini-row">
          <span>قیمت تقریبی</span>
          <span>{toman(price)}</span>
        </div>
      ) : null}
      {when ? (
        <div className="mini-row">
          <span>زمان</span>
          <span>{new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(when))} — ساعت {timeLabel(when)}</span>
        </div>
      ) : null}
    </div>
  );
}
