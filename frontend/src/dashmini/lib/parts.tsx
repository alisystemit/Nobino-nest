/**
 * اجزای مشترک داشبورد مینی‌استایل — روی واژگان ظاهری ماژول /mini سوار می‌شوند
 * (mini.css) و منطقشان دقیقاً همان کاری است که نسخهٔ وب انجام می‌دهد.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Chip, EmptyState, Icon, Row, SectionTitle, Sheet, SkeletonList, StatusBadge, type IconName } from "@/mini/components/ui";
import { compactToman, faDigits, timeLabel, toman } from "@/mini/lib/format";
import { UNLIMITED_FROM } from "@/lib/plans/limit-defs";
import type { DashSalonOption } from "./store";
import { useDash } from "./store";

export type DashRole = "SALON_OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

export function canSee(roles: DashRole[] | undefined, role?: string | null): boolean {
  if (!roles || !roles.length) return true;
  return roles.includes(role as DashRole);
}

/* ── کارت بخش (جای لینک‌های منوی کناری نسخهٔ وب) ─────────────────────── */

export type Tile = {
  to: string;
  label: string;
  sub?: string;
  icon: IconName;
  roles?: DashRole[];
  external?: boolean;
};

export function Tiles({ items }: { items: Tile[] }) {
  const navigate = useNavigate();
  const { me } = useDash();
  const visible = items.filter((t) => canSee(t.roles, me?.role));
  if (!visible.length) return null;
  return (
    <div className="dash-tiles">
      {visible.map((t) => (
        <button
          key={t.to}
          type="button"
          className="dash-tile"
          onClick={() => navigate(t.external ? t.to : t.to, t.external ? undefined : { replace: false })}
        >
          <span className="dash-tile-icon">
            <Icon name={t.icon} size={18} />
          </span>
          <span className="dash-tile-title">{t.label}</span>
          {t.sub ? <span className="dash-tile-sub">{t.sub}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ── چهار خانۀ آمار بالای داشبورد ──────────────────────────────────── */

export function StatGrid({
  loading,
  cells,
}: {
  loading: boolean;
  cells: { value: string; label: string }[];
}) {
  if (loading) return <SkeletonList count={1} />;
  return (
    <div className="mini-stats is-4">
      {cells.map((c) => (
        <div key={c.label} className="mini-stat">
          <b>{c.value}</b>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── سوییچر سالن‌ها (چند سالنی) ─────────────────────────────────────── */

export function SalonSwitcher() {
  const { mySalons, salonId, setSalonId } = useDash();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const current = mySalons.find((s) => s.id === salonId);
  if (mySalons.length < 2) {
    return current ? (
      <span className="dash-switch-btn" aria-label="سالن فعال">
        <Icon name="store" size={15} />
        <span>{current.name}</span>
      </span>
    ) : null;
  }
  return (
    <>
      <button type="button" className="dash-switch-btn" onClick={() => setOpen(true)} aria-label="تغییر سالن">
        <Icon name="store" size={15} />
        <span>{current?.name ?? "سالن‌های من"}</span>
      </button>
      <Sheet open={open} title="سالن‌های من" onClose={() => setOpen(false)}>
        <div className="mini-list">
          {mySalons.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`mini-item${s.id === salonId ? " is-on" : ""}`}
              onClick={() => {
                setSalonId(s.id);
                setOpen(false);
              }}
            >
              <span className="mini-item-main">
                <span className="mini-item-title">{s.name}</span>
                {s.id === salonId ? <span className="mini-item-sub">در حال مشاهده</span> : null}
              </span>
              {s.id === salonId ? <Icon name="check" size={18} /> : null}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button
            variant="soft"
            onClick={() => {
              setOpen(false);
              navigate("/dashboard/setup?new=1");
            }}
          >
            <Icon name="plus" size={17} />
            ساخت سالن جدید
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/* ── نوار مصرف پلن (همان snap بارگذاری dashboard-salon) ─────────────── */

export function PlanMeters({
  snap,
  planLabel,
}: {
  snap: { counts: { key: string; label: string; icon: string; used: number; limit: number }[]; bools: { key: string; label: string; icon: string; on: boolean }[] } | undefined;
  planLabel?: string;
}) {
  if (!snap) return null;
  return (
    <>
      <SectionTitle title="مصرف پلن" hint={planLabel ? `سقف‌های ${planLabel}` : undefined} />
      <div className="mini-card">
        {snap.counts.map((c) => {
          const unlimited = c.limit >= UNLIMITED_FROM;
          const pct = unlimited ? 8 : Math.min(100, Math.round((c.used / Math.max(1, c.limit)) * 100));
          const tone = pct >= 100 ? " is-bad" : pct >= 80 ? " is-warn" : "";
          return (
            <div key={c.key} className="dash-meter">
              <div className="dash-meter-head">
                <span>
                  {c.icon} {c.label}
                </span>
                <span>{unlimited ? "نامحدود" : `${faDigits(c.used)} از ${faDigits(c.limit)}`}</span>
              </div>
              <div className={`dash-meter-bar${tone}`}>
                <i style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {snap.bools.length ? (
          <div className="dash-tags">
            {snap.bools.map((b) => (
              <span key={b.key} className={`dash-tag${b.on ? "" : " is-off"}`}>
                {b.icon} {b.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

/* ── ردیف نوبت با کارهای وضعیت ─────────────────────────────────────── */

export type DashAppt = {
  id: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  endAt?: string;
  status: string;
  channel?: string;
  service?: string | null;
  servicePrice?: number | null;
  employee?: string | null;
  note?: string | null;
  salonTimezone?: string | null;
  depositAmount?: number | null;
  depositPaid?: boolean | null;
};

export function ApptRow({
  appt,
  busy,
  onStatus,
  extra,
}: {
  appt: DashAppt;
  busy?: boolean;
  onStatus?: (status: string) => void;
  extra?: ReactNode;
}) {
  const actionable = appt.status === "REQUESTED" || appt.status === "CONFIRMED";
  return (
    <div className="mini-card mini-appt">
      <div className="mini-appt-head">
        <b style={{ fontSize: 14 }}>{timeLabel(appt.startAt, appt.salonTimezone ?? undefined)}</b>
        <StatusBadge status={appt.status} />
      </div>
      <div className="mini-appt-body">
        <div>
          {appt.customerName} ·{" "}
          <a className="mini-link" href={`tel:${appt.customerPhone}`} dir="ltr">
            {appt.customerPhone}
          </a>
        </div>
        <div>
          {appt.service ?? "بدون خدمت"}
          {appt.employee ? ` · ${appt.employee}` : ""} · {toman(appt.servicePrice ?? 0)}
        </div>
        {appt.depositAmount ? (
          <div style={{ fontSize: 12 }}>
            بیعانه {compactToman(appt.depositAmount)} — {appt.depositPaid ? "پرداخت شده" : "پرداخت نشده"}
          </div>
        ) : null}
        {appt.note ? <div style={{ fontSize: 12 }}>یادداشت: {appt.note}</div> : null}
        {appt.channel && appt.channel !== "MANUAL" ? <div style={{ fontSize: 11.5 }}>ثبت از: {appt.channel === "VOICE" ? "رزرو صوتی" : "سایت"}</div> : null}
      </div>
      {actionable && onStatus ? (
        <div className="mini-actions">
          {appt.status === "REQUESTED" ? (
            <button type="button" className="mini-btn tiny" disabled={busy} onClick={() => onStatus("CONFIRMED")}>
              تأیید
            </button>
          ) : null}
          <button type="button" className="mini-btn soft tiny" disabled={busy} onClick={() => onStatus("COMPLETED")}>
            انجام شد
          </button>
          <button type="button" className="mini-btn ghost tiny" disabled={busy} onClick={() => onStatus("NO_SHOW")}>
            نیامد
          </button>
          <button type="button" className="mini-btn ghost tiny" disabled={busy} onClick={() => onStatus("CANCELLED")}>
            لغو
          </button>
        </div>
      ) : null}
      {extra ? <div className="mini-actions">{extra}</div> : null}
    </div>
  );
}

/* ── چیپ‌های فیلتر وضعیت ───────────────────────────────────────────── */

export function StatusChips({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (next: string) => void;
  counts?: Record<string, number>;
}) {
  const items: { id: string; label: string }[] = [
    { id: "ALL", label: "همه" },
    { id: "REQUESTED", label: "در انتظار" },
    { id: "CONFIRMED", label: "تأیید شده" },
    { id: "COMPLETED", label: "انجام شده" },
    { id: "CANCELLED", label: "لغو شده" },
    { id: "NO_SHOW", label: "نیامده" },
  ];
  return (
    <div className="mini-chips">
      {items.map((it) => (
        <Chip key={it.id} on={value === it.id} onClick={() => onChange(it.id)}>
          {it.label}
          {counts && counts[it.id] !== undefined ? ` (${faDigits(counts[it.id])})` : ""}
        </Chip>
      ))}
    </div>
  );
}

/* ── کارت «این بخش هنوز در نسخهٔ مینی نیست» ────────────────────────── */

export function SoonCard({ title, classicHref }: { title: string; classicHref: string }) {
  const navigate = useNavigate();
  return (
    <>
      <EmptyState text={`${title} هنوز به سبک مینی‌اپ بازنویسی نشده است.`} hint="فعلاً همان نسخهٔ وب را باز می‌کند تا چیزی از دست نرود." />
      <div style={{ marginTop: 12 }}>
        <Button variant="soft" onClick={() => navigate(classicHref)}>
          <Icon name="link" size={17} />
          باز کردن {title} (نسخهٔ وب)
        </Button>
      </div>
    </>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return <Row label={label} value={value} />;
}

/* ── صفحه‌بندی فهرست‌های بلند (کمپین، صف انتظار، …) ─────────────────── */

export function Pager({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (next: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="dash-pager">
      <button type="button" className="mini-btn soft tiny" disabled={page <= 1} onClick={() => onChange(Math.max(1, page - 1))}>
        قبلی
      </button>
      <span>
        صفحه {faDigits(page)} از {faDigits(totalPages)} · {faDigits(total)} مورد
      </span>
      <button type="button" className="mini-btn soft tiny" disabled={page >= totalPages} onClick={() => onChange(Math.min(totalPages, page + 1))}>
        بعدی
      </button>
    </div>
  );
}

/* ── دکمهٔ حذف دو مرحله‌ای (هیچ حذفی با یک لمس اتفاق نمی‌افتد) ──────── */

export function DeleteButton({ onConfirm, busy, label = "حذف" }: { onConfirm: () => void; busy?: boolean; label?: string }) {
  const [armed, setArmed] = useState(false);

  // اگر شیت بسته شد یا عملیات طولانی شد، حالت «مطمئنی؟» خودبرگشتی است
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4500);
    return () => window.clearTimeout(t);
  }, [armed]);

  return (
    <button
      type="button"
      className={`mini-btn tiny${armed ? " danger" : " ghost"}`}
      disabled={busy}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
    >
      <Icon name="trash" size={15} />
      {armed ? "برای حذف، دوباره" : label}
    </button>
  );
}
