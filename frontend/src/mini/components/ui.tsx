/**
 * اجزای کوچک و مشترک مینی‌اپ.
 * عمداً بدون وابستگی به اجزای سایت/پنل نوشته شده‌اند تا ماژول /mini مستقل بماند
 * و استایلش فقط از mini.css بیاید.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { faDigits } from "../lib/format";

/* ── آیکون‌های درون‌خطی (SVG) ─────────────────────────────────────── */

const ICON_PATHS = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15V15h-6v6.5H4.5A1.5 1.5 0 0 1 3 20z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>
  ),
  store: (
    <>
      <path d="M4 9h16l-1 11H5z" />
      <path d="M4 9 6 4h12l2 5" />
      <path d="M9 13h6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.6-4 4.6-6 8-6s6.4 2 8 6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  star: <path d="m12 3.6 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.7-5.3 2.7 1-5.8L3.5 9.8l5.9-.9z" />,
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8.2 7.8 20 18M8.2 16.2 20 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l4 2.5" />
    </>
  ),
  back: <path d="m9 6 6 6-6 6" />,
  check: <path d="m5 13 4.5 4.5L19 7" />,
  sparkle: <path d="M12 3.5 13.7 9l5.5 1.7L13.7 12.5 12 18l-1.7-5.5L4.8 10.7 10.3 9z" />,
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z" />,
  link: (
    <>
      <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.5 1.5" />
      <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.5-1.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1.2-3.4 3.7-5 6.5-5s5.3 1.6 6.5 5" />
      <path d="M16.5 5.5a3.2 3.2 0 0 1 0 6M18 14.6c2 .7 3.3 2.3 4 5.4" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18M16 14h2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  refresh: <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4h-4" />,
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 4 1.2 5.5 2 6.5H4c.8-1 2-2.5 2-6.5z" />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13A1.5 1.5 0 0 1 18.5 20H14" />
      <path d="M10 8 6 12l4 4M6 12h9" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M14 6l4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </>
  ),
  chat: (
    <>
      <path d="M20 12a7 7 0 0 1-7 7H8l-4 3V12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7z" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.6 12 20 12 20z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeWidth="2.2" />
    </>
  ),
  send: <path d="M4 12l16-7-6 16-2.5-6z" />,
  pin: (
    <>
      <path d="M12 21s6-5.6 6-10.5A6 6 0 0 0 6 10.5C6 15.4 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </>
  ),
  bolt: <path d="M13 3 5.5 13H11l-1 8 8.5-10.5H12z" />,
  ticket: (
    <>
      <path d="M4 9V6.5h16V9a3 3 0 0 0 0 6v2.5H4V15a3 3 0 0 0 0-6z" />
      <path d="M12 7v10" strokeDasharray="2 3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 12a7 7 0 0 0 14 0M12 19v2.5" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/** ستارهٔ توپر برای نمایش امتیاز */
export function StarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="m12 3.6 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.7-5.3 2.7 1-5.8L3.5 9.8l5.9-.9z" />
    </svg>
  );
}

/* ── نوار بالا ────────────────────────────────────────────────────── */

export function TopBar({
  brand,
  platformChip,
  onBack,
  backLabel = "بازگشت",
  actions,
}: {
  brand: string;
  platformChip?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mini-top">
      {onBack ? (
        <button type="button" className="mini-back" onClick={onBack} aria-label={backLabel}>
          <Icon name="back" size={18} />
        </button>
      ) : (
        <span className="mini-brand-mark" aria-hidden="true">
          <Icon name="scissors" size={17} />
        </span>
      )}
      <div className="mini-brand">{brand}</div>
      {actions ? <div className="mini-top-actions">{actions}</div> : null}
      {platformChip ? <span className="mini-platform-chip">{platformChip}</span> : null}
    </div>
  );
}

/** زنگولهٔ اطلاعیه‌ها با شمارندۀ ناخوانده */
export function BellButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" className="mini-bell" onClick={onClick} aria-label={`اطلاعیه‌ها${count ? ` (${count} ناخوانده)` : ""}`}>
      <Icon name="bell" size={19} />
      {count > 0 ? <em className="mini-bell-dot">{count > 9 ? "۹+" : faDigits(count)}</em> : null}
    </button>
  );
}

/* ── عنوان بخش ────────────────────────────────────────────────────── */

export function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="mini-section-title">
      <span>
        {title}
        {hint ? <small> · {hint}</small> : null}
      </span>
      {action ?? null}
    </div>
  );
}

/* ── وضعیت نوبت ───────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "در انتظار تأیید",
  CONFIRMED: "تأیید شده",
  COMPLETED: "انجام شده",
  CANCELLED: "لغو شده",
  NO_SHOW: "عدم حضور",
};

export function StatusBadge({ status }: { status: string }) {
  const key = String(status || "").toLowerCase();
  return <span className={`mini-badge is-${key}`}>{STATUS_LABEL[status] ?? status}</span>;
}

/* ── دکمه ─────────────────────────────────────────────────────────── */

export function Button({
  variant = "primary",
  tiny = false,
  loading = false,
  disabled = false,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "soft"; tiny?: boolean; loading?: boolean }) {
  const built = `mini-btn ${variant === "primary" ? "" : variant}${tiny ? " tiny" : ""}${className ? ` ${className}` : ""}`;
  return (
    <button type="button" className={built} disabled={disabled || loading} {...rest}>
      {loading ? <Spinner size={tiny ? 14 : 18} /> : children}
    </button>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ animation: "mini-spin 0.8s linear infinite" }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── فیلد ورودی ───────────────────────────────────────────────────── */

export function Field({ label, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = rest.id ?? `f-${rest.name}`;
  return (
    <div className="mini-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className={className ? `mini-input ${className}` : "mini-input"} {...rest} />
      {hint ? <div className="mini-option-sub" style={{ marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

/* ── فیلد چندخطی ──────────────────────────────────────────────────── */

export function Area({
  label,
  hint,
  rows = 4,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = rest.id ?? `a-${rest.name}`;
  return (
    <div className="mini-field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="mini-input mini-textarea" rows={rows} {...rest} />
      {hint ? <div className="mini-option-sub" style={{ marginTop: 6 }}>{hint}</div> : null}
    </div>
  );
}

/* ── انتخابگر ستاره (برای ثبت نظر) ────────────────────────────────── */

export function Stars({ value, onChange, readOnly = false }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className={`mini-stars-input${readOnly ? " is-readonly" : ""}`} role={readOnly ? undefined : "radiogroup"}>
      {[5, 4, 3, 2, 1].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          aria-label={`${n} ستاره`}
          aria-checked={value === n}
          role={readOnly ? undefined : "radio"}
          className={`mini-star${n <= value ? " is-on" : ""}`}
          onClick={() => onChange?.(n)}
        >
          <StarIcon size={26} />
        </button>
      ))}
    </div>
  );
}

/* ── تب‌های بخش (کنترل قطعه‌ای) ────────────────────────────────────── */

export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string; icon?: IconName; badge?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="mini-tabs-seg" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="tab"
          aria-selected={value === it.id}
          className={`mini-tab-seg${value === it.id ? " is-on" : ""}`}
          onClick={() => onChange(it.id)}
        >
          {it.icon ? <Icon name={it.icon} size={15} /> : null}
          <span>{it.label}</span>
          {it.badge ? <em className="mini-tab-badge">{faDigits(it.badge)}</em> : null}
        </button>
      ))}
    </div>
  );
}

/* ── چیپ قابل کلیک (فیلترهای ساده) ────────────────────────────────── */

export function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className={`mini-chip${on ? " is-on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

/* ── ردیف کلید/مقدار ──────────────────────────────────────────────── */

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mini-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/* ── خالی / اسکلتون ───────────────────────────────────────────────── */

export function EmptyState({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="mini-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" strokeDasharray="3 4" />
        <path d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8" />
        <path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.2" />
      </svg>
      <div>{text}</div>
      {hint ? <div style={{ marginTop: 4, fontSize: 12 }}>{hint}</div> : null}
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="mini-list" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="mini-skeleton" />
      ))}
    </div>
  );
}

/* ── شیت پایین ────────────────────────────────────────────────────── */

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <div className="mini-sheet-backdrop" onClick={onClose} />
      <div className="mini-sheet mini-fade" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mini-sheet-grabber" />
        <h3>{title}</h3>
        {children}
      </div>
    </>
  );
}
