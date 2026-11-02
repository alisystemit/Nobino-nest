/**
 * نوبت‌های مشتری در مینی‌اپ — فهرست صفحه‌به‌صفحه + کارهای روی هر نوبت
 * (تغییر وقت، لغو، ثبت نظر) از کامپوننت مشترک ./../components/appt-actions.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoginSheet from "../components/login-sheet";
import { AppointmentActions, CancelSheet, RescheduleSheet, ReviewSheet } from "../components/appt-actions";
import { Button, EmptyState, Icon, SectionTitle, SkeletonList, StatusBadge } from "../components/ui";
import { faDigits, fullLabel, fromNow, toman } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import type { MiniAppointment } from "../lib/types";

const PAGE_SIZE = 10;

export default function MiniBookings() {
  const navigate = useNavigate();
  const { me, authReady } = useMini();
  const isStaff = Boolean(me && me.role !== "CUSTOMER");
  const [items, setItems] = useState<MiniAppointment[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  const [moveTarget, setMoveTarget] = useState<MiniAppointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MiniAppointment | null>(null);
  const [reviewTarget, setReviewTarget] = useState<MiniAppointment | null>(null);

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
  /** کارهای مشتری (تغییر وقت/لغو/نظر) فقط روی نوبت خودش منطقی است */
  const mine = (a: MiniAppointment) => !me?.phone || a.customerPhone === me.phone;
  const upcoming = items
    .filter((a) => new Date(a.startAt).getTime() >= now && a.status !== "CANCELLED")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const past = items.filter((a) => new Date(a.startAt).getTime() < now || a.status === "CANCELLED");

  const reload = () => void load(1, true);

  return (
    <div className="mini-fade">
      <SectionTitle title="نوبت‌های پیش‌رو" hint={loading ? "" : `${faDigits(upcoming.length)} مورد`} />
      {isStaff ? (
        <div className="mini-note" style={{ marginBottom: 10 }}>
          این فهرست نوبت‌های سالن شماست. برای تأیید، «انجام شد» یا ثبت نوبت حضوری به تب «مدیریت» بروید.
        </div>
      ) : null}
      {loading ? (
        <SkeletonList count={2} />
      ) : error ? (
        <div className="mini-note" style={{ color: "#b91c1c" }}>{error}</div>
      ) : upcoming.length === 0 ? (
        <EmptyState text="نوبت پیش‌رویی ندارید." hint="از صفحهٔ اول، ساعت دلخواهتان را رزرو کنید." />
      ) : (
        <div className="mini-list">
          {upcoming.map((a) => (
            <div key={a.id} className="mini-card mini-appt">
              <div className="mini-appt-head">
                <button
                  type="button"
                  className="mini-link"
                  style={{ border: 0, background: "transparent", font: "inherit", cursor: "pointer" }}
                  onClick={() => a.salonSlug && navigate(`/mini/s/${a.salonSlug}`)}
                >
                  {a.salonName ?? "سالن"}
                </button>
                <StatusBadge status={a.status} />
              </div>
              <div className="mini-appt-body">
                <div>
                  {fullLabel(a.startAt, a.salonTimezone ?? undefined)}
                  <span style={{ marginInlineStart: 6 }}>· {fromNow(a.startAt)}</span>
                </div>
                <div>
                  {a.service ?? "خدمت ثبت نشده"}
                  {a.employee ? ` · ${a.employee}` : ""}
                </div>
                {a.note ? <div style={{ fontSize: 12 }}>یادداشت: {a.note}</div> : null}
                {a.depositAmount && !a.depositPaid ? (
                  <div style={{ fontSize: 12 }}>
                    <Icon name="wallet" size={13} /> بیعانهٔ {toman(a.depositAmount)} هنوز پرداخت نشده.
                  </div>
                ) : null}
              </div>
              {mine(a) ? (
                <AppointmentActions
                  appt={a}
                  onChangeTime={() => setMoveTarget(a)}
                  onCancel={() => setCancelTarget(a)}
                  onReview={() => setReviewTarget(a)}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {past.length ? (
        <>
          <SectionTitle title="تاریخچه" hint={`${faDigits(past.length)} مورد`} />
          <div className="mini-list">
            {past.map((a) => (
              <div key={a.id} className="mini-card mini-appt" style={{ opacity: 0.82 }}>
                <div className="mini-appt-head">
                  <b style={{ fontSize: 13.5 }}>{a.salonName ?? "سالن"}</b>
                  <StatusBadge status={a.status} />
                </div>
                <div className="mini-appt-body">
                  <div>{fullLabel(a.startAt, a.salonTimezone ?? undefined)}</div>
                  <div>
                    {a.service ?? "بدون خدمت"}
                    {a.employee ? ` · ${a.employee}` : ""}
                  </div>
                </div>
                {/* برای نوبت انجام‌شده، «ثبت نظر» همان‌جا می‌آید تا کار تمام نشده نماند */}
                {mine(a) ? (
                  <AppointmentActions
                    appt={a}
                    onChangeTime={() => setMoveTarget(a)}
                    onCancel={() => setCancelTarget(a)}
                    onReview={() => setReviewTarget(a)}
                  />
                ) : null}
              </div>
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

      <RescheduleSheet appt={moveTarget} onClose={() => setMoveTarget(null)} onDone={reload} />
      <CancelSheet appt={cancelTarget} onClose={() => setCancelTarget(null)} onDone={reload} />
      <ReviewSheet appt={reviewTarget} onClose={() => setReviewTarget(null)} onDone={reload} />
    </div>
  );
}
