/**
 * نوبت‌های مشتری در مینی‌اپ — با «صفحه‌بندی» و امکان لغو طبق قوانین سالن.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginSheet from "../components/login-sheet";
import { Button, EmptyState, Field, SectionTitle, Sheet, SkeletonList, StatusBadge } from "../components/ui";
import { faDigits, fullLabel, fromNow } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import type { MiniAppointment } from "../lib/types";

const PAGE_SIZE = 10;

export default function MiniBookings() {
  const navigate = useNavigate();
  const { me, authReady, config, toast } = useMini();
  const [items, setItems] = useState<MiniAppointment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MiniAppointment | null>(null);
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError("");
      const res = await mapi<{
        success: boolean;
        error?: string;
        total: number;
        totalPages: number;
        appointments: MiniAppointment[];
      }>(`/api/appointments?limit=${PAGE_SIZE}&page=${targetPage}`);
      if (!res.ok) setError(res.data?.error || "نوبت‌ها بارگذاری نشد");
      const rows = Array.isArray(res.data?.appointments) ? res.data.appointments : [];
      setItems((prev) => (replace ? rows : [...prev, ...rows]));
      setTotalPages(res.data?.totalPages ?? 1);
      setPage(targetPage);
      if (replace) setLoading(false);
      else setLoadingMore(false);
    },
    []
  );

  useEffect(() => {
    if (!authReady) return;
    if (!me) {
      setItems([]);
      setLoading(false);
      return;
    }
    void load(1, true);
  }, [authReady, me, load]);

  async function doCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/appointments/${cancelTarget.id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });
    setCancelling(false);
    if (!res.ok) {
      toast(res.data?.error || "لغو ممکن نشد", "error");
      return;
    }
    toast("نوبت لغو شد", "ok");
    setCancelTarget(null);
    setReason("");
    void load(1, true);
  }

  if (authReady && !me) {
    return (
      <div className="mini-fade">
        <EmptyState text="برای دیدن نوبت‌هایتان وارد شوید." hint="ورود با کد پیامکی، کمتر از ۳۰ ثانیه." />
        <Button onClick={() => setLoginOpen(true)}>ورود</Button>
        <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} />
      </div>
    );
  }

  const now = Date.now();
  const upcoming = items.filter((a) => new Date(a.startAt).getTime() >= now && a.status !== "CANCELLED");
  const past = items.filter((a) => new Date(a.startAt).getTime() < now || a.status === "CANCELLED");

  return (
    <div className="mini-fade">
      <SectionTitle title="نوبت‌های پیش‌رو" hint={loading ? "" : `${faDigits(upcoming.length)} مورد`} />
      {loading ? (
        <SkeletonList count={2} />
      ) : error ? (
        <div className="mini-note" style={{ color: "#b91c1c" }}>{error}</div>
      ) : upcoming.length === 0 ? (
        <EmptyState text="نوبت پیش‌رویی ندارید." hint="از صفحهٔ اول یک سالن انتخاب کنید." />
      ) : (
        <div className="mini-list">
          {upcoming.map((a) => (
            <AppointmentCard
              key={a.id}
              appt={a}
              onSalon={() => a.salonSlug && navigate(`/mini/s/${a.salonSlug}`)}
              onCancel={() => setCancelTarget(a)}
            />
          ))}
        </div>
      )}

      {past.length ? (
        <>
          <SectionTitle title="تاریخچه" hint={`${faDigits(past.length)} مورد`} />
          <div className="mini-list">
            {past.map((a) => (
              <AppointmentCard key={a.id} appt={a} muted onSalon={() => a.salonSlug && navigate(`/mini/s/${a.salonSlug}`)} />
            ))}
          </div>
        </>
      ) : null}

      {page < totalPages ? (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="mini-btn soft" disabled={loadingMore} onClick={() => void load(page + 1, false)}>
            {loadingMore ? "در حال بارگذاری…" : "نوبت‌های قدیمی‌تر"}
          </button>
        </div>
      ) : null}

      <Sheet open={Boolean(cancelTarget)} title="لغو نوبت" onClose={() => setCancelTarget(null)}>
        {cancelTarget ? (
          <>
            <div className="mini-note" style={{ marginBottom: 12 }}>
              «{cancelTarget.salonName}» — {fullLabel(cancelTarget.startAt, cancelTarget.salonTimezone ?? undefined)}
            </div>
            <Field label="دلیل لغو (اختیاری)" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً تغییر برنامه" />
            <Button variant="ghost" className="danger" onClick={doCancel} loading={cancelling}>
              بله، لغو کن
            </Button>
            <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center" }}>
              {config.brand.supportPhone ? "در صورت نیاز با پشتیبانی سالن تماس بگیرید." : ""}
            </div>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

function AppointmentCard({
  appt,
  muted = false,
  onSalon,
  onCancel,
}: {
  appt: MiniAppointment;
  muted?: boolean;
  onSalon: () => void;
  onCancel?: () => void;
}) {
  return (
    <div className="mini-card mini-appt" style={muted ? { opacity: 0.78 } : undefined}>
      <div className="mini-appt-head">
        <button type="button" className="mini-link" style={{ border: 0, background: "transparent", font: "inherit", cursor: "pointer" }} onClick={onSalon}>
          {appt.salonName ?? "سالن"}
        </button>
        <StatusBadge status={appt.status} />
      </div>
      <div className="mini-appt-body">
        <div>
          {fullLabel(appt.startAt, appt.salonTimezone ?? undefined)}
          {!muted ? <span style={{ marginInlineStart: 6 }}>· {fromNow(appt.startAt)}</span> : null}
        </div>
        <div>
          {appt.service ?? "خدمت ثبت نشده"}
          {appt.employee ? ` · ${appt.employee}` : ""}
        </div>
        {appt.note ? <div style={{ fontSize: 12 }}>یادداشت: {appt.note}</div> : null}
      </div>
      {onCancel ? (
        <div className="mini-actions">
          <button type="button" className="mini-btn ghost tiny" onClick={onCancel}>
            لغو نوبت
          </button>
        </div>
      ) : null}
    </div>
  );
}
