/**
 * نوبت‌ها — نسخهٔ مینی‌استایلِ صفحهٔ /dashboard/appointments.
 * داده از همان بارگذاری «agenda» می‌آید (یک منبع، دو پوسته) و کارها روی
 * /api/appointments/* انجام می‌شود: تأیید، انجام شد، نیامد، لغو با دلیل،
 * جابه‌جایی به ساعت آزاد، تماس و پیامک، و هشدار یادآوری‌های نرسیده.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Field, Icon, SectionTitle, Sheet, SkeletonList, StatusBadge } from "@/mini/components/ui";
import { DayStrip, SlotGrid, upcomingDays } from "@/mini/components/booking";
import { compactToman, dayLabel, faDigits, relativeDayLabel, timeLabel, weekdayLabel, ymd } from "@/mini/lib/format";
import { isDone, nextAppointment, splitDay, summarize, type AgendaItem } from "@/lib/appointments/agenda-view";
import { usePageData } from "@/lib/page-data";
import { dapi } from "../lib/api";
import { ApptRow, SalonSwitcher, StatusChips } from "../lib/parts";
import { useDash } from "../lib/store";

type AgendaPayload = {
  agenda?: {
    dayISO: string;
    todayISO: string;
    timezone: string;
    rows: AgendaItem[];
    salons: { id: string; name: string }[];
    activeSalonId: string | null;
    role: string;
  };
};

/** پنجرهٔ روزها: دو روز قبل تا دوازده روز بعد */
function dayWindow(tz: string): string[] {
  const today = ymd(new Date(), tz);
  const base = new Date(`${today}T12:00:00`);
  const out: string[] = [];
  for (let i = -2; i < 13; i++) out.push(ymd(new Date(base.getTime() + i * 86_400_000), tz));
  return out;
}

export default function DashAgenda() {
  const { salonId, setSalonId, canManage, me, toast } = useDash();
  const [day, setDay] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [pastOpen, setPastOpen] = useState(false);
  const [detail, setDetail] = useState<AgendaItem | null>(null);
  const [reminders, setReminders] = useState<{ name: string; phone: string; time: string; problem: string }[]>([]);

  const params: Record<string, string | undefined> = {};
  if (canManage && salonId) params.salon = salonId;
  if (day) params.date = day;
  const { data, loading, reload } = usePageData<AgendaPayload>("agenda", params);
  const agenda = data?.agenda;
  const tz = agenda?.timezone || "Asia/Tehran";
  const rows = agenda?.rows ?? [];

  /* اولین بار که روز به وقت سالن رسید، حالت را هم‌راستا می‌کنیم */
  useEffect(() => {
    if (!day && agenda?.dayISO) setDay(agenda.dayISO);
  }, [agenda?.dayISO, day]);

  const days = useMemo(() => dayWindow(tz), [tz]);
  const sum = useMemo(() => summarize(rows), [rows]);
  const now = Date.now();
  const isToday = Boolean(agenda && agenda.dayISO === agenda.todayISO);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: rows.length, REQUESTED: 0, CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 };
    for (const r of rows) if (c[r.status] !== undefined) c[r.status]++;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "ALL" && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        (r.service ?? "").toLowerCase().includes(q) ||
        (r.employee ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  const split = useMemo(() => splitDay(visible, now), [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const hero = useMemo(() => (isToday ? nextAppointment(rows, now) : null), [rows, isToday]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => reload(), [reload]);

  /* یادآوری‌های فردا که پیامکشان نرسیده (مخصوص مالک سالن) */
  useEffect(() => {
    if (!canManage || !agenda?.activeSalonId) {
      setReminders([]);
      return;
    }
    let alive = true;
    const tomorrow = ymd(new Date(Date.now() + 86_400_000), tz);
    void (async () => {
      const res = await dapi<{ success: boolean; items?: { customerName: string; customerPhone: string; startAt: string; problem: string | null }[] }>(
        `/api/dashboard/salons/${agenda.activeSalonId}/reminders?date=${tomorrow}`
      );
      if (!alive || !res.ok) return;
      const bad = (res.data?.items ?? []).filter((i) => i.problem && i.problem !== "PENDING");
      setReminders(
        bad.map((i) => ({
          name: i.customerName,
          phone: i.customerPhone,
          time: timeLabel(i.startAt, tz),
          problem: i.problem === "FAILED" ? "پیامک نرفت" : "در صف نیست",
        }))
      );
    })();
    return () => {
      alive = false;
    };
  }, [agenda?.activeSalonId, canManage, tz]);

  async function changeStatus(item: AgendaItem, status: string, reason?: string) {
    setBusyId(item.id + status);
    const res = await dapi<{ success: boolean; error?: string }>(`/api/appointments/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, ...(reason ? { cancelReason: reason } : {}) }),
    });
    setBusyId("");
    if (!res.ok) {
      toast(res.data?.error || "وضعیت ثبت نشد", "error");
      return;
    }
    setDetail(null);
    toast(
      status === "CONFIRMED" ? "نوبت تأیید شد" : status === "COMPLETED" ? "انجام شد ثبت شد" : status === "NO_SHOW" ? "عدم حضور ثبت شد" : "نوبت لغو شد",
      "ok"
    );
    refresh();
  }

  /** لغو توسط خود مشتری مسیر و قوانین جدا دارد */
  async function customerCancel(item: AgendaItem, reason: string) {
    setBusyId(item.id + "CANCELLED");
    const res = await dapi<{ success: boolean; error?: string }>(`/api/appointments/${item.id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || undefined }),
    });
    setBusyId("");
    if (!res.ok) {
      toast(res.data?.error || "لغو ممکن نشد", "error");
      return;
    }
    setDetail(null);
    toast("نوبت لغو شد", "ok");
    refresh();
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="نوبت‌های روز" hint={day ? `${relativeDayLabel(day, tz)} · ${weekdayLabel(day, tz)}` : undefined} />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          <button type="button" className="mini-btn ghost tiny" onClick={refresh} aria-label="نوسازی">
            <Icon name="refresh" size={15} />
          </button>
          <SalonSwitcher />
        </div>
      </div>

      {day ? (
        <DayStrip
          days={days}
          value={day}
          timezone={tz}
          onChange={(d) => {
            setDay(d);
            setPastOpen(false);
          }}
        />
      ) : null}

      {(agenda?.salons?.length ?? 0) > 1 ? (
        <div className="mini-chips" style={{ marginTop: 10 }}>
          {(agenda?.salons ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              className={`mini-chip${s.id === agenda?.activeSalonId ? " is-on" : ""}`}
              onClick={() => setSalonId(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div style={{ marginTop: 12 }}>
          <SkeletonList count={3} />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <EmptyState
            text={isToday ? "امروز نوبتی ثبت نشده است." : "این روز خالی است."}
            hint={canManage ? "با «رزرو دستی» یا «رزرو صوتی» می‌توانید نوبت اضافه کنید." : undefined}
          />
          {canManage ? (
            <div className="mini-actions" style={{ justifyContent: "center" }}>
              <a className="mini-btn tiny" href="/dash/booking">
                <Icon name="plus" size={15} />
                ثبت نوبت دستی
              </a>
              <a className="mini-btn soft tiny" href="/dash/voice-booking">
                <Icon name="mic" size={15} />
                رزرو صوتی
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {/* یک نگاه به روز */}
          <div className="mini-card" style={{ marginTop: 12 }}>
            <div className="mini-appt-head">
              <b>
                {faDigits(sum.total)} نوبت {isToday ? "امروز" : day ? dayLabel(day, tz) : ""}
              </b>
              <span className="mini-option-sub">{faDigits(sum.progress)}٪ تمام شده</span>
            </div>
            <div className="mini-appt-body">
              <div>
                {faDigits(sum.completed)} انجام شد · {faDigits(sum.requested)} در انتظار · {faDigits(sum.confirmed)} تأیید شده
              </div>
              <div>
                درآمد قطعی {compactToman(sum.revenue)} · در انتظار {compactToman(sum.expected)}
                {sum.depositDue ? ` · بیعانهٔ پرداخت‌نشده ${compactToman(sum.depositDue)}` : ""}
              </div>
              <div>
                {hero ? `نوبت بعدی: ${hero.customerName} ساعت ${timeLabel(hero.startAt, hero.salonTimezone ?? tz)}` : "نوبت باقی‌مانده‌ای ندارد."}
              </div>
            </div>
            <div className="dash-meter-bar" style={{ marginTop: 10 }}>
              <i style={{ width: `${sum.progress}%` }} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <StatusChips value={filter} onChange={setFilter} counts={counts} />
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="جستجو" name="dash_appt_search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="نام، شماره، خدمت یا آرایشگر" />
          </div>

          {visible.length === 0 ? (
            <div style={{ marginTop: 12 }}>
              <EmptyState text="نوبتی با این فیلتر یا جستجو پیدا نشد." />
            </div>
          ) : (
            <>
              {split.live.length ? (
                <>
                  <SectionTitle title="هم‌اکنون روی صندلی" hint={`${faDigits(split.live.length)} مورد`} />
                  <div className="mini-list">
                    {split.live.map((r) => (
                      <ApptRow
                        key={r.id}
                        appt={r}
                        busy={busyId.startsWith(r.id)}
                        onStatus={(s) => void changeStatus(r, s)}
                        extra={
                          <button type="button" className="mini-btn ghost tiny" onClick={() => setDetail(r)}>
                            کارهای بیشتر
                          </button>
                        }
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {split.upcoming.length ? (
                <>
                  <SectionTitle title={isToday ? "باقی‌ماندهٔ امروز" : "نوبت‌های این روز"} hint={`${faDigits(split.upcoming.length)} مورد`} />
                  <div className="mini-list">
                    {split.upcoming.map((r) => (
                      <ApptRow
                        key={r.id}
                        appt={r}
                        busy={busyId.startsWith(r.id)}
                        onStatus={(s) => void changeStatus(r, s)}
                        extra={
                          <button type="button" className="mini-btn ghost tiny" onClick={() => setDetail(r)}>
                            کارهای بیشتر
                          </button>
                        }
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {split.past.length ? (
                <>
                  <button
                    type="button"
                    className="mini-btn soft"
                    style={{ width: "100%", marginTop: 12 }}
                    onClick={() => setPastOpen((v) => !v)}
                    aria-expanded={pastOpen}
                  >
                    گذشتهٔ روز — {faDigits(split.past.length)} نوبت ({pastOpen ? "بستن" : "نمایش"})
                  </button>
                  {pastOpen ? (
                    <div className="mini-list" style={{ marginTop: 12 }}>
                      {split.past.map((r) => (
                        <ApptRow
                          key={r.id}
                          appt={r}
                          busy={busyId.startsWith(r.id)}
                          onStatus={isDone(r.status) ? undefined : (s) => void changeStatus(r, s)}
                          extra={
                            <button type="button" className="mini-btn ghost tiny" onClick={() => setDetail(r)}>
                              کارهای بیشتر
                            </button>
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </>
      )}

      {reminders.length ? (
        <>
          <SectionTitle title="فردا — یادآوری نرسیده" hint={`${faDigits(reminders.length)} مورد`} />
          <div className="mini-card">
            <p className="mini-option-sub" style={{ marginBottom: 8, lineHeight: 1.9 }}>
              پیامک این نوبت‌ها به مشتری نرسیده؛ خودتان تماس بگیرید تا صندلی خالی نماند.
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

      <ApptSheet
        item={detail}
        timezone={tz}
        busy={busyId.startsWith(detail?.id ?? "__none__")}
        isCustomer={me?.role === "CUSTOMER"}
        onClose={() => setDetail(null)}
        onDone={() => {
          setDetail(null);
          refresh();
        }}
        onStatus={(status, reason) => detail && void changeStatus(detail, status, reason)}
        onCustomerCancel={(reason) => detail && void customerCancel(detail, reason)}
      />
    </div>
  );
}

/* ── شیت کارهای نوبت (تماس، پیامک، جابه‌جایی، لغو با دلیل) ────────── */

function ApptSheet({
  item,
  timezone,
  busy,
  isCustomer,
  onClose,
  onDone,
  onStatus,
  onCustomerCancel,
}: {
  item: AgendaItem | null;
  timezone: string;
  busy: boolean;
  isCustomer: boolean;
  onClose: () => void;
  onDone: () => void;
  onStatus: (status: string, reason?: string) => void;
  onCustomerCancel: (reason: string) => void;
}) {
  const [step, setStep] = useState<"menu" | "cancel" | "move">("menu");
  const [reason, setReason] = useState("");
  const [moveDay, setMoveDay] = useState("");
  const [slots, setSlots] = useState<{ startAt: string; endAt: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotValue, setSlotValue] = useState("");
  const [moveError, setMoveError] = useState("");
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!item) {
      setStep("menu");
      setReason("");
      setMoveDay("");
      setSlots([]);
      setSlotValue("");
      setMoveError("");
    }
  }, [item]);

  const tz = item?.salonTimezone || timezone;
  const days = useMemo(() => upcomingDays(21, tz), [tz]);

  useEffect(() => {
    if (step !== "move" || !item?.serviceId || !item.salonSlug) return;
    const date = moveDay || ymd(new Date(), tz);
    let alive = true;
    setSlotsLoading(true);
    setSlotValue("");
    void (async () => {
      const q = new URLSearchParams({ serviceId: item.serviceId as string, date });
      if (item.employeeId) q.set("employeeId", item.employeeId);
      if (item.branchId) q.set("branchId", item.branchId);
      const res = await dapi<{ success: boolean; error?: string; slots?: { startAt: string; endAt: string }[] }>(
        `/api/salons/${item.salonSlug}/availability?${q.toString()}`
      );
      if (!alive) return;
      setSlots(res.ok ? res.data?.slots ?? [] : []);
      if (!res.ok) setMoveError(res.data?.error || "زمان‌های آزاد دریافت نشد");
      setSlotsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [step, moveDay, item, tz]);

  async function applyMove() {
    if (!item || !slotValue) return;
    setMoving(true);
    setMoveError("");
    const res = await dapi<{ success: boolean; error?: string }>(`/api/appointments/${item.id}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ startAt: slotValue }),
    });
    setMoving(false);
    if (!res.ok) {
      setMoveError(res.data?.error || "تغییر زمان ممکن نشد");
      return;
    }
    onDone();
  }

  if (!item) return null;

  const canMove = Boolean(item.serviceId && item.salonSlug);

  return (
    <Sheet open={Boolean(item)} title={`نوبت ${item.customerName}`} onClose={onClose}>
      <div className="mini-card" style={{ padding: 10, marginBottom: 12 }}>
        <div className="mini-appt-head">
          <b>
            {timeLabel(item.startAt, tz)} تا {timeLabel(item.endAt, tz)}
          </b>
          <StatusBadge status={item.status} />
        </div>
        <div className="mini-appt-body">
          <div>
            {item.service ?? "بدون خدمت"}
            {item.employee ? ` · ${item.employee}` : ""}
          </div>
          {item.salonName ? <div>{item.salonName}</div> : null}
          {item.note ? <div>یادداشت: {item.note}</div> : null}
        </div>
      </div>

      {step === "menu" ? (
        <>
          <div className="mini-actions">
            <a className="mini-btn tiny" href={`tel:${item.customerPhone}`} dir="ltr">
              <Icon name="phone" size={15} />
              تماس
            </a>
            <a className="mini-btn soft tiny" href={`sms:${item.customerPhone}`} dir="ltr">
              <Icon name="send" size={15} />
              پیامک
            </a>
          </div>

          {!isDone(item.status) ? (
            <div style={{ marginTop: 10 }}>
              <button type="button" className="mini-btn soft" style={{ width: "100%" }} onClick={() => setStep("move")}>
                <Icon name="calendar" size={17} />
                جابه‌جایی به ساعت آزاد دیگر
              </button>
            </div>
          ) : null}

          {isCustomer ? (
            item.status === "REQUESTED" || item.status === "CONFIRMED" ? (
              <div style={{ marginTop: 10 }}>
                <button type="button" className="mini-btn ghost" style={{ width: "100%" }} onClick={() => setStep("cancel")}>
                  لغو این نوبت
                </button>
              </div>
            ) : null
          ) : (
            <>
              {item.status === "REQUESTED" ? (
                <div style={{ marginTop: 10 }}>
                  <Button loading={busy} onClick={() => onStatus("CONFIRMED")}>
                    <Icon name="check" size={17} />
                    تأیید نوبت
                  </Button>
                </div>
              ) : null}
              {!isDone(item.status) ? (
                <div className="mini-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="mini-btn tiny" disabled={busy} onClick={() => onStatus("COMPLETED")}>
                    انجام شد
                  </button>
                  <button type="button" className="mini-btn ghost tiny" disabled={busy} onClick={() => onStatus("NO_SHOW")}>
                    مراجعه نکرد
                  </button>
                  <button type="button" className="mini-btn ghost tiny" disabled={busy} onClick={() => setStep("cancel")}>
                    لغو با دلیل
                  </button>
                </div>
              ) : null}
            </>
          )}

          {isCustomer && item.salonSlug ? (
            <div style={{ marginTop: 10 }}>
              <a className="mini-btn soft" style={{ width: "100%", display: "inline-flex", justifyContent: "center" }} href={`/s/${item.salonSlug}`} target="_blank" rel="noreferrer">
                <Icon name="store" size={17} />
                صفحهٔ سالن و رزرو دوباره
              </a>
            </div>
          ) : null}
        </>
      ) : step === "cancel" ? (
        <>
          <Field
            label="دلیل لغو (اختیاری)"
            name="dash_cancel_reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثلاً: آرایشگر مرخصی است"
          />
          <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
            با ثبت لغو، برای مشتری پیامک اطلاع‌رسانی می‌رود.
          </div>
          <div className="mini-btn-row" style={{ marginTop: 12 }}>
            <Button variant="ghost" onClick={() => setStep("menu")}>
              بازگشت
            </Button>
            <Button
              className="danger"
              loading={busy}
              onClick={() => (isCustomer ? onCustomerCancel(reason.trim()) : onStatus("CANCELLED", reason.trim() || undefined))}
            >
              ثبت لغو نوبت
            </Button>
          </div>
        </>
      ) : (
        <>
          {!canMove ? (
            <div className="mini-note">این نوبت خدمت یا سالن مشخصی ندارد؛ جابه‌جایی از این صفحه ممکن نیست. با سالن تماس بگیرید.</div>
          ) : (
            <>
              <SectionTitle title="روز جدید" hint={dayLabel(moveDay || ymd(new Date(), tz), tz)} />
              <DayStrip days={days} value={moveDay || ymd(new Date(), tz)} timezone={tz} onChange={setMoveDay} />
              <SectionTitle title="ساعت‌های آزاد" />
              <SlotGrid
                slots={slots}
                value={slotValue}
                timezone={tz}
                loading={slotsLoading}
                emptyText="در این روز زمان آزادی نیست؛ روز دیگری را انتخاب کنید."
                onSelect={setSlotValue}
              />
              {moveError ? <div className="mini-note" style={{ marginTop: 10 }}>{moveError}</div> : null}
              <div className="mini-btn-row" style={{ marginTop: 12 }}>
                <Button variant="ghost" onClick={() => setStep("menu")}>
                  بازگشت
                </Button>
                <Button disabled={!slotValue} loading={moving} onClick={() => void applyMove()}>
                  ثبت زمان جدید
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
