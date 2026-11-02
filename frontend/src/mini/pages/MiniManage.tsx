/**
 * بخش «مدیریت سالن» در مینی‌اپ — برای آرایشگر/مالک سالن و ادمین.
 * از همان endpoint های داشبورد استفاده می‌کند (آمار، نوبت‌های یک روز، تغییر وضعیت)
 * تا داده‌ها با پنل وب یکی بماند.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Icon, Row, SectionTitle, Sheet, SkeletonList, StatusBadge } from "../components/ui";
import { dayLabel, faDigits, relativeDayLabel, timeLabel, toman, weekdayLabel, ymd } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import type { DashboardStats, MiniAppointment } from "../lib/types";

const DAYS_WINDOW = 7;

export default function MiniManage() {
  const navigate = useNavigate();
  const { me, authReady, config, toast } = useMini();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [day, setDay] = useState(() => ymd(new Date()));
  const [items, setItems] = useState<MiniAppointment[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [cancelTarget, setCancelTarget] = useState<MiniAppointment | null>(null);

  const canManage = Boolean(me && (me.role === "SALON_OWNER" || me.role === "ADMIN" || me.role === "AGENT"));

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const res = await mapi<{ success: boolean; error?: string; stats?: DashboardStats }>("/api/dashboard/stats");
    if (res.ok && res.data.stats) setStats(res.data.stats);
    else setError(res.data?.error || "آمار بارگذاری نشد");
    setStatsLoading(false);
  }, []);

  const loadDay = useCallback(
    async (target: string) => {
      setListLoading(true);
      const to = target;
      const res = await mapi<{ success: boolean; error?: string; appointments?: MiniAppointment[] }>(
        `/api/appointments?from=${to}&to=${to}`
      );
      if (!res.ok) setError(res.data?.error || "نوبت‌ها بارگذاری نشد");
      const rows = Array.isArray(res.data?.appointments) ? res.data.appointments : [];
      // در مینی‌اپ فقط نوبت‌های تأییدنشده/تأییدشدهٔ همان روز مهم است؛ ترتیب زمانی
      setItems(rows.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
      setListLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!authReady) return;
    if (!canManage) {
      setStatsLoading(false);
      setListLoading(false);
      return;
    }
    void loadStats();
    void loadDay(day);
  }, [authReady, canManage, day, loadStats, loadDay]);

  async function changeStatus(id: string, status: string) {
    setBusyId(id + status);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setBusyId("");
    if (!res.ok) {
      toast(res.data?.error || "تغییر وضعیت ممکن نشد", "error");
      return;
    }
    toast(
      status === "CONFIRMED" ? "نوبت تأیید شد" : status === "COMPLETED" ? "انجام شد ثبت شد" : "نوبت لغو شد",
      "ok"
    );
    await Promise.all([loadDay(day), loadStats()]);
  }

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < DAYS_WINDOW; i++) out.push(ymd(new Date(Date.now() + i * 86_400_000)));
    return out;
  }, []);

  if (authReady && !me) {
    return (
      <div className="mini-fade">
        <EmptyState text="برای مدیریت سالن وارد حساب شوید." hint="این بخش فقط برای آرایشگرها و ادمین است." />
        <Button variant="ghost" onClick={() => navigate("/mini/me")}>
          رفتن به صفحهٔ ورود
        </Button>
      </div>
    );
  }

  if (!config.features.manageTab) {
    return <EmptyState text="بخش مدیریت در تنظیمات پنل غیرفعال شده است." />;
  }

  if (!canManage) {
    return (
      <div className="mini-fade">
        <EmptyState
          text="حساب شما به عنوان آرایشگر ثبت نشده است."
          hint="برای راه‌اندازی سالن و مدیریت نوبت‌ها از پنل وب استفاده کنید."
        />
        <Button variant="ghost" onClick={() => navigate("/dashboard")}>
          باز کردن پنل وب
        </Button>
      </div>
    );
  }

  return (
    <div className="mini-fade">
      {/* آمار */}
      {statsLoading ? (
        <SkeletonList count={1} />
      ) : (
        <div className="mini-stats">
          <div className="mini-stat">
            <b>{faDigits(stats?.today ?? 0)}</b>
            <span>نوبت امروز</span>
          </div>
          <div className="mini-stat">
            <b>{faDigits(stats?.pending ?? 0)}</b>
            <span>در انتظار تأیید</span>
          </div>
          <div className="mini-stat">
            <b>{faDigits(stats?.total ?? 0)}</b>
            <span>کل نوبت‌ها</span>
          </div>
          <div className="mini-stat">
            <b>{faDigits(Math.round(Number(stats?.balance ?? 0)))}</b>
            <span>موجودی (تومان)</span>
          </div>
        </div>
      )}
      {error ? <div className="mini-note" style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div> : null}

      {stats?.slug ? (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="mini-btn soft" onClick={() => navigate(`/mini/s/${stats.slug}`)}>
            <Icon name="store" size={17} />
            مشاهدهٔ صفحهٔ سالن من
          </button>
        </div>
      ) : null}

      {/* انتخاب روز */}
      <SectionTitle title="نوبت‌های روز" hint={weekdayLabel(day)} />
      <div className="mini-days" role="tablist">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            role="tab"
            aria-selected={day === d}
            className={`mini-day${day === d ? " is-on" : ""}`}
            onClick={() => setDay(d)}
          >
            <b>{dayLabel(d).split(" ")[0]}</b>
            <span>{relativeDayLabel(d)}</span>
          </button>
        ))}
      </div>

      {listLoading ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <EmptyState text="در این روز نوبتی نیست." hint="ساعت کاری و تعطیلات سالن روی زمان‌های خالی اثر دارد." />
      ) : (
        <div className="mini-list">
          {items.map((a) => (
            <div key={a.id} className="mini-card mini-appt">
              <div className="mini-appt-head">
                <b style={{ fontSize: 14 }}>{timeLabel(a.startAt, a.salonTimezone ?? undefined)}</b>
                <StatusBadge status={a.status} />
              </div>
              <div className="mini-appt-body">
                <div>
                  {a.customerName} · <span dir="ltr">{a.customerPhone}</span>
                </div>
                <div>
                  {a.service ?? "بدون خدمت"}
                  {a.employee ? ` · ${a.employee}` : ""} · {toman(a.servicePrice ?? 0)}
                </div>
                {a.note ? <div style={{ fontSize: 12 }}>یادداشت: {a.note}</div> : null}
                {a.channel && a.channel !== "MANUAL" ? <div style={{ fontSize: 11.5 }}>ثبت از: {a.channel}</div> : null}
              </div>
              {a.status === "REQUESTED" || a.status === "CONFIRMED" ? (
                <div className="mini-actions">
                  {a.status === "REQUESTED" ? (
                    <button
                      type="button"
                      className="mini-btn tiny"
                      disabled={busyId === a.id + "CONFIRMED"}
                      onClick={() => void changeStatus(a.id, "CONFIRMED")}
                    >
                      تأیید
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="mini-btn soft tiny"
                    disabled={busyId === a.id + "COMPLETED"}
                    onClick={() => void changeStatus(a.id, "COMPLETED")}
                  >
                    انجام شد
                  </button>
                  <button type="button" className="mini-btn ghost tiny" onClick={() => setCancelTarget(a)}>
                    لغو
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mini-note" style={{ marginTop: 16 }}>
        برای ویرایش ساعت کاری، خدمات، کمیشن آرایشگران و گزارش‌ها به پنل وب بروید — این بخش فقط همان داده‌ها را ساده‌سازی‌شده نشان می‌دهد.
      </div>
      <div style={{ marginTop: 10 }}>
        <Button variant="ghost" onClick={() => navigate("/dashboard")}>
          <Icon name="wallet" size={17} />
          پنل کامل مدیریت
        </Button>
      </div>

      <Sheet open={Boolean(cancelTarget)} title="لغو نوبت مشتری" onClose={() => setCancelTarget(null)}>
        {cancelTarget ? (
          <>
            <div className="mini-card" style={{ padding: 10, marginBottom: 12 }}>
              <Row label="مشتری" value={cancelTarget.customerName} />
              <Row label="ساعت" value={timeLabel(cancelTarget.startAt, cancelTarget.salonTimezone ?? undefined)} />
              <Row label="خدمت" value={cancelTarget.service ?? "—"} />
            </div>
            <div className="mini-btn-row">
              <Button variant="ghost" onClick={() => setCancelTarget(null)}>
                بازگشت
              </Button>
              <Button
                className="danger"
                loading={busyId === cancelTarget.id + "CANCELLED"}
                onClick={async () => {
                  const id = cancelTarget.id;
                  setCancelTarget(null);
                  await changeStatus(id, "CANCELLED");
                }}
              >
                لغو نوبت
              </Button>
            </div>
            <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center" }}>برای مشتری پیامک اطلاع‌رسانی ارسال می‌شود.</div>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}
