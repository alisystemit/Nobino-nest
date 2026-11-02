/**
 * هاب «مدیریت سالن» در مینی‌اپ — چهار تب ساده: امروز، پکیج‌ها، مشتریان، مالی.
 * همه از endpoint های داشبورد وب می‌آیند تا داده با پنل یکی بماند و نیاز به
 * مسیر تازه‌ای در بک‌اند نباشد. تب‌های پکیج/مشتری/مالی در ./../components/manage
 * نوشته شده‌اند؛ این فایل فقط نوبت‌های روز و ثبت نوبت حضوری را دارد.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DayStrip, SlotGrid, StaffPicker, upcomingDays } from "../components/booking";
import { CustomersTab, FinanceTab, ServicesTab } from "../components/manage";
import { Button, EmptyState, Field, Icon, Row, SectionTitle, Sheet, SkeletonList, StatusBadge, Tabs } from "../components/ui";
import { compactToman, dayLabel, faDigits, isPhone, normalizePhone, relativeDayLabel, timeLabel, toman, weekdayLabel, ymd } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import type { AvailabilityResponse, DashboardStats, MiniAppointment, MiniService, MiniStaff } from "../lib/types";

type TabId = "today" | "services" | "customers" | "finance";

const TAB_IDS: TabId[] = ["today", "services", "customers", "finance"];

/** /mini/manage?tab=finance — لینک مستقیم به یک تب (برای اطلاعیه‌ها و پیامک‌های مدیریتی) */
function tabFromParam(value: string | null): TabId {
  return value && TAB_IDS.includes(value as TabId) ? (value as TabId) : "today";
}

const DAYS_WINDOW = 7;

export default function MiniManage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { me, authReady, config, toast } = useMini();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>(() => tabFromParam(params.get("tab")));
  const [pendingToday, setPendingToday] = useState(0);

  const canManage = Boolean(me && (me.role === "SALON_OWNER" || me.role === "ADMIN" || me.role === "AGENT"));

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    setError("");
    const res = await mapi<{ success: boolean; error?: string; stats?: DashboardStats }>("/api/dashboard/stats");
    if (res.ok && res.data.stats) setStats(res.data.stats);
    else setError(res.data?.error || "آمار بارگذاری نشد");
    setStatsLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady || !canManage) {
      setStatsLoading(false);
      return;
    }
    void loadStats();
  }, [authReady, canManage, loadStats]);

  useEffect(() => {
    setTab(tabFromParam(params.get("tab")));
  }, [params]);

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

  const salonId = stats?.salonId ?? "";

  return (
    <div className="mini-fade">
      {statsLoading ? (
        <SkeletonList count={1} />
      ) : (
        <div className="mini-stats is-4">
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
            <b>{compactToman(Number(stats?.balance ?? 0))}</b>
            <span>موجودی (تومان)</span>
          </div>
        </div>
      )}
      {error ? <div className="mini-note" style={{ marginTop: 10, color: "#b91c1c" }}>{error}</div> : null}

      {stats && !stats.hasSalon && stats.salonId === undefined && me?.role === "SALON_OWNER" ? (
        <div className="mini-note" style={{ marginTop: 12 }}>
          حساب شما هنوز سالنی ندارد. برای ساخت سالن به پنل وب بروید.
        </div>
      ) : null}

      {!statsLoading && !salonId ? (
        <div className="mini-note" style={{ marginTop: 12 }}>
          مدیریت کامل (پکیج، مشتری و مالی) برای حساب {me?.role === "ADMIN" ? "ادمین" : "نماینده"} در پنل وب است.
          برای دیدن نوبت‌های امروز، از بخش «نوبت‌ها» پنل استفاده کنید.
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <Tabs
          items={[
            { id: "today", label: "امروز", icon: "calendar", badge: pendingToday },
            { id: "services", label: "پکیج‌ها", icon: "scissors" },
            { id: "customers", label: "مشتریان", icon: "users" },
            { id: "finance", label: "مالی", icon: "chart" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        {salonId && tab === "today" ? (
          <TodayPanel
            salonId={salonId}
            slug={stats?.slug ?? ""}
            onReloadStats={() => void loadStats()}
            onPendingChange={setPendingToday}
            toast={toast}
          />
        ) : tab === "services" && salonId ? (
          <ServicesTab salonId={salonId} />
        ) : tab === "customers" && salonId ? (
          <CustomersTab salonId={salonId} />
        ) : tab === "finance" && salonId ? (
          <FinanceTab salonId={salonId} balance={Number(stats?.balance ?? 0)} />
        ) : (
          <EmptyState text="سالنی برای مدیریت پیدا نشد." hint="اگر مالک سالن هستید، از پنل وب سالن خود را بسازید." />
        )}
      </div>

      {stats?.slug ? (
        <div style={{ marginTop: 14 }}>
          <button type="button" className="mini-btn soft" onClick={() => navigate(`/mini/s/${stats.slug}`)}>
            <Icon name="store" size={17} />
            مشاهدهٔ صفحهٔ سالن من
          </button>
        </div>
      ) : null}

      <div className="mini-note" style={{ marginTop: 16 }}>
        تنظیمات ظریف‌تر (ساعت کاری، تعطیلات، کمیشن آرایشگران، کمپین پیامکی) در پنل وب است.
      </div>
      <div style={{ marginTop: 10 }}>
        <Button variant="ghost" onClick={() => navigate("/dashboard")}>
          <Icon name="wallet" size={17} />
          پنل کامل مدیریت
        </Button>
      </div>
    </div>
  );
}

/* ── تب «امروز» ─────────────────────────────────────────────────────── */

function TodayPanel({
  salonId,
  slug,
  onReloadStats,
  onPendingChange,
  toast,
}: {
  salonId: string;
  slug: string;
  onReloadStats: () => void;
  onPendingChange: (count: number) => void;
  toast: (message: string, kind?: "info" | "ok" | "error") => void;
}) {
  const [day, setDay] = useState(() => ymd(new Date()));
  const [items, setItems] = useState<MiniAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MiniAppointment | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [reminders, setReminders] = useState<{ name: string; phone: string; time: string; problem: string }[]>([]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < DAYS_WINDOW; i++) out.push(ymd(new Date(Date.now() + i * 86_400_000)));
    return out;
  }, []);

  const loadDay = useCallback(async () => {
    setLoading(true);
    const res = await mapi<{ success: boolean; error?: string; appointments?: MiniAppointment[] }>(`/api/appointments?from=${day}&to=${day}`);
    const rows = Array.isArray(res.data?.appointments) ? res.data.appointments : [];
    setItems(rows.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
    onPendingChange(rows.filter((a) => a.status === "REQUESTED").length);
    if (!res.ok) toast(res.data?.error || "نوبت‌ها بارگذاری نشد", "error");
    setLoading(false);
  }, [day, onPendingChange, toast]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  /* یادآوری‌های فردا — فقط نوبت‌هایی که پیامکشان نرفته یا ناموفق بوده */
  useEffect(() => {
    const tomorrow = ymd(new Date(Date.now() + 86_400_000));
    let alive = true;
    void (async () => {
      const res = await mapi<{ success: boolean; items?: { id: string; customerName: string; customerPhone: string; startAt: string; problem: string | null }[] }>(
        `/api/dashboard/salons/${salonId}/reminders?date=${tomorrow}`
      );
      if (!alive || !res.ok) return;
      const bad = (res.data?.items ?? []).filter((i) => i.problem && i.problem !== "PENDING");
      setReminders(
        bad.map((i) => ({
          name: i.customerName,
          phone: i.customerPhone,
          time: timeLabel(i.startAt),
          problem: i.problem === "FAILED" ? "پیامک نرفت" : "در صف نیست",
        }))
      );
    })();
    return () => {
      alive = false;
    };
  }, [salonId, day]);

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
    const label =
      status === "CONFIRMED" ? "تأیید شد" : status === "COMPLETED" ? "انجام شد ثبت شد" : status === "NO_SHOW" ? "عدم حضور ثبت شد" : "نوبت لغو شد";
    toast(label, "ok");
    await Promise.all([loadDay(), onReloadStats()]);
  }

  async function confirmAll() {
    const ids = items.filter((a) => a.status === "REQUESTED").map((a) => a.id);
    if (!ids.length) return;
    setBatchBusy(true);
    let ok = 0;
    for (const id of ids) {
      const res = await mapi<{ success: boolean }>(`/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "CONFIRMED" }) });
      if (res.ok) ok++;
    }
    setBatchBusy(false);
    toast(ok ? `${faDigits(ok)} نوبت تأیید شد` : "تأیید ممکن نشد", ok ? "ok" : "error");
    await Promise.all([loadDay(), onReloadStats()]);
  }

  const pending = items.filter((a) => a.status === "REQUESTED").length;

  return (
    <>
      <SectionTitle title="نوبت‌های روز" hint={weekdayLabel(day)} />
      <DayStrip days={days} value={day} onChange={setDay} />

      <div className="mini-quick" style={{ marginTop: 12 }}>
        <Button variant="soft" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={17} />
          نوبت حضوری
        </Button>
        {pending > 1 ? (
          <Button variant="ghost" loading={batchBusy} onClick={() => void confirmAll()}>
            <Icon name="check" size={17} />
            تأیید همه ({faDigits(pending)})
          </Button>
        ) : null}
      </div>

      {loading ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <EmptyState text="در این روز نوبتی نیست." hint="با «نوبت حضوری» مشتریانی که سرخود آمده‌اند را ثبت کنید." />
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
                  {a.customerName} ·{" "}
                  <a className="mini-link" href={`tel:${a.customerPhone}`} dir="ltr">
                    {a.customerPhone}
                  </a>
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
                    <button type="button" className="mini-btn tiny" disabled={busyId === a.id + "CONFIRMED"} onClick={() => void changeStatus(a.id, "CONFIRMED")}>
                      تأیید
                    </button>
                  ) : null}
                  <button type="button" className="mini-btn soft tiny" disabled={busyId === a.id + "COMPLETED"} onClick={() => void changeStatus(a.id, "COMPLETED")}>
                    انجام شد
                  </button>
                  <button type="button" className="mini-btn ghost tiny" disabled={busyId === a.id + "NO_SHOW"} onClick={() => void changeStatus(a.id, "NO_SHOW")}>
                    نیامد
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

      {reminders.length ? (
        <>
          <SectionTitle title="فردا — یادآوری نرسیده" hint={`${faDigits(reminders.length)} مورد`} />
          <div className="mini-card">
            <p className="mini-option-sub" style={{ marginBottom: 8, lineHeight: 1.9 }}>
              پیامک این نوبت‌ها به مشتری نرسیده است؛ خودتان تماس بگیرید تا خالی نماند.
            </p>
            {reminders.map((r) => (
              <div key={r.phone + r.time} className="mini-item">
                <span className="mini-item-main">
                  <span className="mini-item-title">{r.name}</span>
                  <span className="mini-item-sub">
                    ساعت {r.time} · {r.problem}
                  </span>
                </span>
                <a className="mini-icon-btn" href={`tel:${r.phone}`} aria-label="تماس">
                  <Icon name="phone" size={16} />
                </a>
              </div>
            ))}
          </div>
        </>
      ) : null}

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

      <WalkInSheet
        open={addOpen}
        salonId={salonId}
        slug={slug}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          void loadDay();
          onReloadStats();
        }}
      />
    </>
  );
}

/* ── ثبت نوبت حضوری (مشتری مراجع) ──────────────────────────────────── */

function WalkInSheet({
  open,
  salonId,
  slug,
  onClose,
  onDone,
}: {
  open: boolean;
  salonId: string;
  slug: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useMini();
  const [services, setServices] = useState<MiniService[]>([]);
  const [staff, setStaff] = useState<MiniStaff[]>([]);
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState("");
  const [day, setDay] = useState(() => ymd(new Date()));
  const [startAt, setStartAt] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => upcomingDays(DAYS_WINDOW, "Asia/Tehran"), []);

  /* پکیج‌ها و آرایشگران سالن — از همان مسیر عمومی صفحهٔ سالن */
  useEffect(() => {
    if (!open || !slug) return;
    let alive = true;
    void (async () => {
      const [detail, staffRes] = await Promise.all([
        mapi<{ success: boolean; salon?: { services: MiniService[] } }>(`/api/salons/${slug}`),
        mapi<{ success: boolean; staff?: MiniStaff[] }>(`/api/mini/staff?slug=${encodeURIComponent(slug)}`),
      ]);
      if (!alive) return;
      setServices(detail.ok ? detail.data?.salon?.services ?? [] : []);
      setStaff(staffRes.ok ? staffRes.data?.staff ?? [] : []);
    })();
    return () => {
      alive = false;
    };
  }, [open, slug]);

  useEffect(() => {
    if (!open) {
      setServiceIds([]);
      setStaffId("");
      setStartAt("");
      setName("");
      setPhone("");
    }
  }, [open]);

  const timezone = availability?.timezone || "Asia/Tehran";

  useEffect(() => {
    if (!open || !slug || !serviceIds.length) {
      setAvailability(null);
      return;
    }
    let alive = true;
    setSlotsLoading(true);
    setStartAt("");
    const params = new URLSearchParams({ date: day, serviceIds: serviceIds.join(",") });
    if (staffId) params.set("employeeId", staffId);
    void (async () => {
      const res = await mapi<AvailabilityResponse>(`/api/salons/${slug}/availability?${params.toString()}`);
      if (!alive) return;
      setAvailability(res.ok ? res.data : null);
      setSlotsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [open, slug, day, serviceIds.join(","), staffId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    if (!serviceIds.length) {
      toast("یک پکیج انتخاب کنید", "error");
      return;
    }
    if (!startAt) {
      toast("ساعت را انتخاب کنید", "error");
      return;
    }
    if (cleanName.length < 2) {
      toast("نام مشتری را بنویسید", "error");
      return;
    }
    if (!isPhone(cleanPhone)) {
      toast("شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)", "error");
      return;
    }
    setBusy(true);
    const res = await mapi<{ success: boolean; error?: string }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        salonId,
        serviceIds,
        employeeId: staffId || undefined,
        customerName: cleanName,
        customerPhone: cleanPhone,
        startAt,
        channel: "MANUAL",
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast(res.data?.error || "ثبت نوبت ممکن نشد", "error");
      return;
    }
    toast("نوبت حضوری ثبت شد", "ok");
    onDone();
    onClose();
  }

  return (
    <Sheet open={open} title="ثبت نوبت حضوری" onClose={onClose}>
      {!slug ? (
        <div className="mini-note">سالن شما هنوز آماده نیست؛ از پنل وب سالن را کامل کنید.</div>
      ) : (
        <>
          <Field label="نام مشتری" name="wi_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً مریم رضایی" />
          <Field label="موبایل مشتری" name="wi_phone" dir="ltr" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" />

          <SectionTitle title="پکیج" hint="یکی یا چند مورد" />
          {services.length === 0 ? (
            <div className="mini-note">پکیجی تعریف نشده است.</div>
          ) : (
            <div className="mini-chips">
              {services.map((s) => {
                const on = serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`mini-chip${on ? " is-on" : ""}`}
                    onClick={() => setServiceIds((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}

          {staff.length ? (
            <>
              <SectionTitle title="آرایشگر" hint="اختیاری" />
              <StaffPicker staff={staff} value={staffId} onChange={setStaffId} />
            </>
          ) : null}

          <SectionTitle title="روز" />
          <DayStrip days={days} value={day} timezone={timezone} onChange={setDay} />

          <SectionTitle title="ساعت" />
          <SlotGrid
            slots={availability?.slots ?? []}
            value={startAt}
            timezone={timezone}
            loading={slotsLoading}
            emptyText={serviceIds.length ? "این روز پر است؛ روز دیگری را انتخاب کنید." : "اول پکیج را انتخاب کنید."}
            onSelect={setStartAt}
          />

          <div style={{ marginTop: 14 }}>
            <Button onClick={save} loading={busy} disabled={!serviceIds.length || !startAt}>
              ثبت نوبت
            </Button>
          </div>
          <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center", lineHeight: 1.9 }}>
            نوبت حضوری برای مشتری پیامک تأیید نمی‌فرستد؛ فقط در تقویم سالن ثبت می‌شود.
          </div>
          <div className="mini-option-sub" style={{ marginTop: 4, textAlign: "center" }}>{dayLabel(day, timezone)}</div>
        </>
      )}
    </Sheet>
  );
}
