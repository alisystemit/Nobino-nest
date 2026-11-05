/**
 * مدیریت سالن — نسخهٔ مینی‌استایل از تب‌های مدیریتیِ /dashboard/management (سالن‌منیجر).
 *
 * endpoint ها همان مسیرهای پنل وب هستند؛ چیزی از دست نمی‌رود:
 *  • GET/POST/DELETE  {base}/holidays      تعطیلی یا ساعت خاص یک روز
 *  • GET/POST/DELETE  {base}/blocks        بلوک کردن بازهٔ زمانی (ناهار، تعمیرات…)
 *  • GET/POST/DELETE  {base}/branches      شعب
 *  • GET/POST         {base}/campaigns     + POST {base}/campaigns/:id/run
 *  • GET/PATCH        /api/salons/:slug/waitlist
 *  • GET              /api/appointments?from&to   تقویم روز/هفته/ماه
 *  • GET              {base}/excel?type=…  و  POST {base}/import/{customers|appointments}
 *
 * «تقویم روز» (DailyBoard) در همین ماژول صفحهٔ جدا دارد (/dash/appointments) و این‌جا
 * تکرار نشده؛ برای روزِ کاری همان صفحه را ببینید.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";
import { Area, Button, Chip, EmptyState, Field, Icon, SectionTitle, Sheet, SkeletonList, STATUS_LABEL, Tabs } from "@/mini/components/ui";
import { faDigits, faText, timeLabel, ymd } from "@/mini/lib/format";
import { JALALI_MONTHS, WEEKDAYS_SHORT, formatJalali, formatJalaliWithWeekday, isoToJalali, jalaliMonthDays, jalaliToIso, toPersianDigits, weekdayIndexSaturdayFirst } from "@/lib/time/jalali";
import { todayInZone, zonedTimeToIso } from "@/lib/time/zoned";
import { joinLocation } from "@/lib/utils";
import { dapi, qs } from "../lib/api";
import { DeleteButton, Pager, SalonSwitcher } from "../lib/parts";
import { SegmentPanel } from "../lib/segment-panel";
import { useSegmentBuilder, SEGMENT_LABEL, type SegCall, type SegmentKey } from "@/lib/campaign-segments";
import { useDash } from "../lib/store";

type Pane = "calendar" | "holidays" | "blocks" | "branches" | "campaigns" | "waitlist" | "data";
type CalMode = "day" | "week" | "month";

type Ref = { id: string; name: string };
type Branch = { id: string; name: string; city?: string | null; address?: string | null; phone?: string | null; isActive?: boolean; _count?: { staff?: number; appointments?: number } };
type Block = { id: string; startAt: string; endAt: string; reason?: string | null; staff?: { name: string } | null };
type Holiday = { id: string; date: string; isClosed: boolean; openTime?: string | null; closeTime?: string | null; reason?: string | null; branch?: { name: string } | null };
type Campaign = { id: string; name: string; channel: string; segment: string; segmentSummary?: string; status: string; sentCount: number; scheduledAt?: string | null; sentAt?: string | null };
type WaitItem = { id: string; customerName: string; customerPhone: string; note?: string | null; status: string };
type CalAppt = { id: string; startAt: string; customerName: string; employee?: string | null; service?: string | null; status: string; salonId?: string };

const WAITLIST_STATUS: Record<string, string> = {
  WAITING: "در انتظار وقت",
  NOTIFIED: "اطلاع داده شد",
  BOOKED: "نوبت گرفت",
  EXPIRED: "منقضی شد",
};

const CAMPAIGN_STATUS: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  SCHEDULED: "زمان‌بندی شده",
  QUEUED: "در صف ارسال",
  SENT: "ارسال شد",
  FAILED: "ناموفق",
};

/** قالب‌های آمادهٔ پیام مناسبتی — همان ۸ متن نسخهٔ وب ({salon} سمت سرون جایگزین می‌شود) */
const CAMPAIGN_TEMPLATES: { name: string; text: string }[] = [
  { name: "تبریک عید", text: "مشتری عزیز، عید شما مبارک! تیم «{salon}» بهترین آرزوها را برای شما و خانواده محترمتان دارد. منتظر دیدار شما هستیم" },
  { name: "تخفیف ویژه", text: "خبر خوب! «{salon}» به مناسبت این هفته برای تمام خدمات ۲۰٪ تخفیف در نظر گرفته است. تا پایان هفته فرصت را از دست ندهید" },
  { name: "جابه‌جایی سالن", text: "مشتری عزیز، «{salon}» به آدرس جدید منتقل شده است. برای اطلاع از آدرس و مسیر، با ما تماس بگیرید یا به صفحه سالن سر بزنید" },
  { name: "تغییر ساعات کاری", text: "مشتری عزیز، ساعات کاری «{salon}» تغییر کرده است. برای مشاهده ساعات جدید و رزرو آنلاین به صفحه سالن مراجعه کنید" },
  { name: "تبریک تولد", text: "تولدتان مبارک! «{salon}» به مناسبت روز تولد شما یک هدیه ویژه در نظر گرفته است؛ برای دریافت، هنگام مراجعه این پیامک را نشان دهید" },
  { name: "معرفی خدمت جدید", text: "خدمت جدید به «{salon}» اضافه شد! برای مشاهده جزئیات، قیمت‌ها و رزرو آنلاین به صفحه سالن سر بزنید" },
  { name: "تعطیلات و بازگشایی", text: "مشتری عزیز، «{salon}» در ایام تعطیلات فعال نیست. از بازگشایی مجدد و رزرو وقت خود از طریق پیامک بعدی مطلع خواهید شد" },
  { name: "یادآوری تسویه", text: "مشتری عزیز، لطفاً نسبت به تسویه حساب «{salon}» اقدام فرمایید. برای پرداخت آنلاین به پیامک فاکتور مراجعه کنید" },
];

/** نمونهٔ JSON قابل‌کپی برای هر دو نوع ورود داده */
const IMPORT_SAMPLES: Record<string, string> = {
  customers: '[{"phone":"09121234567","name":"مریم","visits":3,"spend":450000,"note":"مراجع هفتگی"}]',
  appointments: '[{"customerName":"مریم","customerPhone":"09121234567","startAt":"2026-11-01T10:00:00.000Z","serviceId":"","status":"COMPLETED"}]',
};

/* ── ابزار تاریخ (همه با کلید میلادی YYYY-MM-DD؛ نمایش شمسی) ─────────── */

function addDays(dateKey: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!m) return dateKey;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekStart(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!m) return dateKey;
  const idx = weekdayIndexSaturdayFirst(Number(m[1]), Number(m[2]), Number(m[3]));
  return addDays(dateKey, -idx);
}

/** روزهای یک ماه شمسی (کلید میلادی) */
function jalaliMonthKeys(jy: number, jm: number): string[] {
  const n = jalaliMonthDays(jy, jm);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(jalaliToIso(jy, jm, i));
  return out;
}

function shiftJalaliMonth(jy: number, jm: number, delta: number): { jy: number; jm: number } {
  let y = jy;
  let m = jm + delta;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return { jy: y, jm: m };
}

function safeIso(dateKey: string, time: string, tz: string): string {
  try {
    return zonedTimeToIso(dateKey, time, tz);
  } catch {
    return "";
  }
}

/** انتخابگر تاریخ شمسی با برچسبِ هم‌سبکِ فیلدهای مینی */
function DateField({
  label,
  value,
  onChange,
  tz,
  min,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  tz: string;
  min?: string;
  placeholder?: string;
}) {
  return (
    <div className="mini-field">
      <label>{label}</label>
      <JalaliDatePicker value={value} onChange={onChange} timeZone={tz} min={min} placeholder={placeholder} className="mini-input" />
    </div>
  );
}

/* ── پن: تقویم ────────────────────────────────────────────────────── */

function CalendarPane({ tz, salonId, staff, services }: { tz: string; salonId: string; staff: Ref[]; services: Ref[] }) {
  const today = useMemo(() => todayInZone(tz), [tz]);
  const [mode, setMode] = useState<CalMode>("week");
  const [anchor, setAnchor] = useState(today);
  const [rows, setRows] = useState<CalAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffF, setStaffF] = useState("");
  const [serviceF, setServiceF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [picked, setPicked] = useState("");

  const anchorJ = useMemo(() => isoToJalali(anchor), [anchor]);

  /** کلید روزهای نمایش‌داده‌شده (ماه تا لبهٔ هفته پر می‌شود) */
  const monthDays = useMemo(() => {
    if (!anchorJ) return [] as string[];
    return jalaliMonthKeys(anchorJ.jy, anchorJ.jm);
  }, [anchorJ]);

  const days = useMemo(() => {
    if (mode === "day") return [anchor];
    if (mode === "week") {
      const start = weekStart(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    if (!monthDays.length) return [];
    const lead = (() => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(monthDays[0]);
      return m ? weekdayIndexSaturdayFirst(Number(m[1]), Number(m[2]), Number(m[3])) : 0;
    })();
    const first = addDays(monthDays[0], -lead);
    const cells = lead + monthDays.length;
    const total = Math.ceil(cells / 7) * 7;
    return Array.from({ length: total }, (_, i) => addDays(first, i));
  }, [mode, anchor, monthDays]);

  const range = useMemo(() => {
    if (!days.length) return null;
    const monthPad = mode === "month";
    const real = monthPad ? days.filter((d) => monthDays.includes(d)) : days;
    if (!real.length) return null;
    const first = real[0];
    const last = real[real.length - 1];
    return { from: safeIso(first, "00:00", tz), to: safeIso(addDays(last, 1), "00:00", tz), first, last };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, mode, monthDays, tz]);

  const load = useCallback(async () => {
    if (!range?.from || !range.to) {
      setRows([]);
      return;
    }
    setLoading(true);
    const res = await dapi<{ success: boolean; appointments?: CalAppt[] }>(`/api/appointments${qs({ from: range.from, to: range.to })}`);
    const list = res.ok ? res.data?.appointments ?? [] : [];
    /* ادمین همهٔ سالن‌ها را می‌بیند؛ این‌جا فقط سالن انتخاب‌شده می‌ماند */
    setRows(salonId ? list.filter((a) => !a.salonId || a.salonId === salonId) : list);
    setLoading(false);
  }, [range, salonId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      rows.filter((a) => {
        if (staffF && a.employee !== staffF) return false;
        if (serviceF && a.service !== serviceF) return false;
        if (statusF && a.status !== statusF) return false;
        return true;
      }),
    [rows, staffF, serviceF, statusF]
  );

  const byDay = useMemo(() => {
    const map: Record<string, CalAppt[]> = {};
    for (const a of visible) {
      const key = ymd(new Date(a.startAt), tz);
      (map[key] ??= []).push(a);
    }
    for (const list of Object.values(map)) list.sort((x, y) => String(x.startAt).localeCompare(String(y.startAt)));
    return map;
  }, [visible, tz]);

  function shift(delta: number) {
    if (mode === "day") setAnchor((d) => addDays(d, delta));
    else if (mode === "week") setAnchor((d) => addDays(d, delta * 7));
    else if (anchorJ) {
      const next = shiftJalaliMonth(anchorJ.jy, anchorJ.jm, delta);
      const maxDay = jalaliMonthDays(next.jy, next.jm);
      setAnchor(jalaliToIso(next.jy, next.jm, Math.min(anchorJ.jd, maxDay)));
    }
  }

  const title =
    mode === "day"
      ? formatJalaliWithWeekday(anchor)
      : mode === "week"
        ? `${formatJalali(days[0] ?? anchor)} تا ${formatJalali(days[6] ?? anchor)}`
        : anchorJ
          ? `${JALALI_MONTHS[anchorJ.jm - 1]} ${toPersianDigits(anchorJ.jy)}`
          : "";

  const monthInMonth = new Set(monthDays);
  const totalShown = visible.length;

  return (
    <div className="mini-card dash-pane">
      <div className="dash-cal-nav">
        <button type="button" className="mini-btn soft tiny" onClick={() => shift(-1)} aria-label="بازهٔ قبل">
          <Icon name="back" size={15} />
          قبل
        </button>
        <button type="button" className="mini-btn ghost tiny" onClick={() => setAnchor(today)}>
          امروز
        </button>
        <button type="button" className="mini-btn soft tiny" onClick={() => shift(1)} aria-label="بازهٔ بعد">
          بعد
          <span style={{ display: "inline-flex", transform: "scaleX(-1)" }}>
            <Icon name="back" size={15} />
          </span>
        </button>
        <span className="dash-cal-title">{title}</span>
        <span className="mini-chips" style={{ marginInlineStart: "auto" }}>
          {(["day", "week", "month"] as CalMode[]).map((m) => (
            <Chip key={m} on={mode === m} onClick={() => setMode(m)}>
              {m === "day" ? "روز" : m === "week" ? "هفته" : "ماه"}
            </Chip>
          ))}
        </span>
      </div>

      <div className="dash-form-gap" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", marginTop: 12 }}>
        <SelectField label="آرایشگر" value={staffF} onChange={setStaffF} options={staff} allLabel="همه آرایشگران" />
        <SelectField label="خدمت" value={serviceF} onChange={setServiceF} options={services} allLabel="همه خدمات" />
      </div>
      <div className="mini-chips" style={{ marginTop: 10 }}>
        {["", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"].map((s) => (
          <Chip key={s || "ALL"} on={statusF === s} onClick={() => setStatusF(s)}>
            {s ? (STATUS_LABEL[s] ?? s) : "همه"}
          </Chip>
        ))}
      </div>
      <div className="mini-note" style={{ marginTop: 10 }}>
        {faDigits(totalShown)} نوبت در بازهٔ انتخابی{statusF ? ` · فقط «${STATUS_LABEL[statusF] ?? statusF}»` : ""}
      </div>

      {loading ? (
        <div style={{ marginTop: 12 }}>
          <SkeletonList count={3} />
        </div>
      ) : mode === "month" ? (
        <>
          <div className="dash-cal-wk" style={{ marginTop: 12 }}>
            {WEEKDAYS_SHORT.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="dash-cal">
            {days.map((key) => {
              const j = isoToJalali(key);
              const outOfMonth = !monthInMonth.has(key);
              const list = byDay[key] ?? [];
              return (
                <button
                  key={key}
                  type="button"
                  className={`dash-cal-cell${key === today ? " is-today" : ""}${outOfMonth ? " is-off" : ""}`}
                  onClick={() => {
                    if (outOfMonth) return;
                    setPicked(key);
                    setAnchor(key);
                    setMode("day");
                  }}
                  aria-label={`${j ? `${j.jd} ${JALALI_MONTHS[j.jm - 1]}` : key} — ${faDigits(list.length)} نوبت`}
                >
                  <span className="dash-cal-num">{j ? toPersianDigits(j.jd) : ""}</span>
                  {list.length ? <span className="dash-cal-count">{faDigits(list.length)}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="mini-note" style={{ marginTop: 12 }}>
            {faDigits(totalShown)} نوبت در این ماه · روی هر روز بزنید تا لیست کاملش باز شود
          </div>
          {picked && (byDay[picked]?.length ? <DayList dayKey={picked} items={byDay[picked]} tz={tz} heading /> : null)}
        </>
      ) : mode === "week" ? (
        <div className="dash-wk" style={{ marginTop: 12 }}>
          {days.map((key) => (
            <DayList key={key} dayKey={key} items={byDay[key] ?? []} tz={tz} />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <DayList dayKey={anchor} items={byDay[anchor] ?? []} tz={tz} />
        </div>
      )}
    </div>
  );
}

/** فیلد انتخاب از فهرست نام‌ها (همان فیلترهای تقویم وب) */
function SelectField({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Ref[];
  allLabel: string;
}) {
  return (
    <div className="mini-field">
      <label>{label}</label>
      <select className="mini-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.name}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function DayList({ dayKey, items, tz, heading }: { dayKey: string; items: CalAppt[]; tz: string; heading?: boolean }) {
  return (
    <div className="dash-wk-day">
      <div className="dash-wk-head">
        <span>{formatJalaliWithWeekday(dayKey)}</span>
        <i>{items.length ? `${faDigits(items.length)} نوبت` : "نوبتی نیست"}</i>
      </div>
      {items.length ? (
        <div style={{ marginTop: heading ? 6 : 6 }}>
          {items.map((a) => (
            <div key={a.id} className="dash-appt-line">
              <time dir="ltr">{timeLabel(a.startAt, tz)}</time>
              <span className="dash-appt-name">{a.customerName}</span>
              <span className="dash-appt-sub">
                {a.service ?? "—"}
                {a.employee ? ` · ${a.employee}` : ""}
              </span>
              <span className="dash-appt-tag">{STATUS_LABEL[a.status] ?? a.status}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── پن: تعطیلات ──────────────────────────────────────────────────── */

function HolidaysPane({ base, tz, branches, notify }: { base: string; tz: string; branches: Branch[]; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [list, setList] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [date, setDate] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("16:00");
  const [reason, setReason] = useState("");
  const [branchId, setBranchId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<{ success: boolean; holidays?: Holiday[] }>(`${base}/holidays`);
    setList(res.ok ? res.data?.holidays ?? [] : []);
    setLoading(false);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!date) {
      setErr("تاریخ را انتخاب کنید.");
      return;
    }
    if (!isClosed && closeTime <= openTime) {
      setErr("ساعت بسته‌شدن باید بعد از ساعت باز شدن باشد.");
      return;
    }
    setErr("");
    setBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/holidays`, {
      method: "POST",
      body: JSON.stringify({
        date,
        isClosed,
        openTime: isClosed ? undefined : openTime,
        closeTime: isClosed ? undefined : closeTime,
        reason: reason.trim() || undefined,
        branchId: branchId || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "ثبت تعطیلی ممکن نشد.");
      notify("ثبت نشد", "error");
      return;
    }
    notify("تعطیلی ثبت شد", "ok");
    setDate("");
    setReason("");
    setOpen(false);
    void load();
  }

  async function remove(id: string) {
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/holidays/${id}`, { method: "DELETE" });
    if (!res.ok) {
      notify(res.data?.error || "حذف نشد", "error");
      return;
    }
    notify("حذف شد", "ok");
    void load();
  }

  return (
    <div className="mini-card dash-pane">
      <SectionTitle
        title="تعطیلات و روزهای خاص"
        hint={`${faDigits(list.length)} مورد`}
        action={
          <button type="button" className="mini-btn tiny" onClick={() => setOpen(true)}>
            <Icon name="plus" size={15} />
            ثبت تعطیلی
          </button>
        }
      />
      <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
        با «تعطیل کامل» آن روز برای همهٔ مشتریان قفل می‌شود؛ با خاموش‌کردنش فقط ساعت کاری آن روز عوض می‌شود (مثلاً نیمه‌وقت).
      </div>

      {loading ? (
        <div style={{ marginTop: 12 }}>
          <SkeletonList count={2} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState text="تعطیلی ثبت‌شده‌ای نیست." hint="مثلاً نوروز یا مرخصی سالن را این‌جا اعلام کنید." />
      ) : (
        <div className="mini-list" style={{ marginTop: 12 }}>
          {list.map((h) => (
            <div key={h.id} className="mini-item">
              <span className="mini-item-main">
                <span className="mini-item-title">
                  {formatJalaliWithWeekday(h.date)}
                  {h.branch?.name ? ` · ${h.branch.name}` : ""}
                </span>
                <span className="mini-item-sub">
                  {h.isClosed ? "تعطیل کامل" : `ساعت ${h.openTime ?? "-"} تا ${h.closeTime ?? "-"}`}
                  {h.reason ? ` · ${h.reason}` : ""}
                </span>
              </span>
              <span className={`dash-tag${h.isClosed ? "" : " is-off"}`}>{h.isClosed ? "تعطیل" : "نیمه‌وقت"}</span>
              <DeleteButton busy={busy} onConfirm={() => void remove(h.id)} />
            </div>
          ))}
        </div>
      )}

      <Sheet open={open} title="ثبت تعطیلی یا ساعت خاص" onClose={() => setOpen(false)}>
        {err ? (
          <div className="mini-note dash-note-bad" style={{ marginBottom: 10 }}>
            {err}
          </div>
        ) : null}
        <div className="dash-form-gap">
          <DateField label="تاریخ (شمسی)" value={date} onChange={setDate} tz={tz} placeholder="انتخاب تاریخ" />
          <div className="mini-chips">
            <Chip on={isClosed} onClick={() => setIsClosed(true)}>
              تعطیل کامل
            </Chip>
            <Chip on={!isClosed} onClick={() => setIsClosed(false)}>
              فقط تغییر ساعت
            </Chip>
          </div>
          {!isClosed ? (
            <div className="dash-two">
              <Field label="از ساعت" name="holOpen" type="time" className="is-ltr" value={openTime} onChange={(e) => setOpenTime(e.target.value)} />
              <Field label="تا ساعت" name="holClose" type="time" className="is-ltr" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} />
            </div>
          ) : null}
          <Field label="دلیل (اختیاری)" name="holReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="نوروز، مرخصی سالن…" />
          {branches.length ? (
            <SelectFieldOptions label="شعبه" value={branchId} onChange={setBranchId} options={branches.map((b) => ({ id: b.id, name: b.name }))} allLabel="کل سالن" />
          ) : null}
          <Button variant="primary" loading={busy} disabled={busy || !date} onClick={() => void add()} className="dash-grow">
            <Icon name="check" size={17} />
            ثبت
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** select با option بر پایهٔ id (برای شعبه/آرایشگر) */
function SelectFieldOptions({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Ref[];
  allLabel: string;
}) {
  return (
    <div className="mini-field">
      <label>{label}</label>
      <select className="mini-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ── پن: بلوک‌های زمانی ───────────────────────────────────────────── */

function BlocksPane({ base, tz, staff, notify }: { base: string; tz: string; staff: Ref[]; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [list, setList] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("12:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<{ success: boolean; blocks?: Block[] }>(`${base}/blocks`);
    setList(res.ok ? res.data?.blocks ?? [] : []);
    setLoading(false);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!startDate || !startTime || !endDate || !endTime) {
      setErr("تاریخ و ساعت شروع و پایان را انتخاب کنید.");
      return;
    }
    const startAt = safeIso(startDate, startTime, tz);
    const endAt = safeIso(endDate, endTime, tz);
    if (!startAt || !endAt) {
      setErr("تاریخ یا ساعت نامعتبر است.");
      return;
    }
    if (endAt <= startAt) {
      setErr("زمان پایان باید بعد از شروع باشد.");
      return;
    }
    setErr("");
    setBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/blocks`, {
      method: "POST",
      body: JSON.stringify({ startAt, endAt, reason: reason.trim() || undefined, staffId: staffId || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "ثبت مسدودسازی ممکن نشد.");
      notify("ثبت نشد", "error");
      return;
    }
    notify("مسدودسازی ثبت شد", "ok");
    setStartDate("");
    setEndDate("");
    setReason("");
    void load();
  }

  async function remove(id: string) {
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/blocks/${id}`, { method: "DELETE" });
    if (!res.ok) {
      notify(res.data?.error || "حذف نشد", "error");
      return;
    }
    notify("حذف شد", "ok");
    void load();
  }

  return (
    <div className="mini-card dash-pane">
      <SectionTitle title="بازه‌های مسدود" hint={`${faDigits(list.length)} مورد`} />
      <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
        ناهار، تعمیرات یا کلاس داخلی؛ در این بازه‌ها ساعت خالی به مشتری نشان داده نمی‌شود.
      </div>

      <div className="dash-form-gap" style={{ marginTop: 12 }}>
        <div className="dash-two">
          <DateField label="از تاریخ" value={startDate} onChange={setStartDate} tz={tz} placeholder="تاریخ شروع" />
          <Field label="از ساعت" name="blkStart" type="time" className="is-ltr" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="dash-two">
          <DateField label="تا تاریخ" value={endDate} onChange={setEndDate} tz={tz} placeholder="تاریخ پایان" />
          <Field label="تا ساعت" name="blkEnd" type="time" className="is-ltr" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <Field label="دلیل (اختیاری)" name="blkReason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="ناهار، تعمیرات، مرخصی…" />
        {staff.length ? <SelectFieldOptions label="آرایشگر (خالی = کل سالن)" value={staffId} onChange={setStaffId} options={staff} allLabel="کل سالن" /> : null}
        {err ? (
          <div className="mini-note dash-note-bad">{err}</div>
        ) : null}
        <Button variant="primary" loading={busy} disabled={busy} onClick={() => void add()} className="dash-grow">
          <Icon name="clock" size={17} />
          ثبت مسدودسازی
        </Button>
      </div>

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <SkeletonList count={2} />
        ) : list.length === 0 ? (
          <EmptyState text="بازهٔ مسدودی ثبت نشده است." />
        ) : (
          <div className="mini-list">
            {list.map((b) => (
              <div key={b.id} className="mini-item">
                <span className="mini-item-main">
                  <span className="mini-item-title">
                    {timeLabel(b.startAt, tz)} تا {timeLabel(b.endAt, tz)} · {formatJalali(ymd(new Date(b.startAt), tz))}
                  </span>
                  <span className="mini-item-sub">
                    {b.reason || "بدون دلیل"}
                    {b.staff?.name ? ` · ${b.staff.name}` : ""}
                  </span>
                </span>
                <DeleteButton busy={busy} onConfirm={() => void remove(b.id)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── پن: شعب ──────────────────────────────────────────────────────── */

function BranchesPane({ base, notify, onChanged }: { base: string; notify: (text: string, kind?: "ok" | "error") => void; onChanged: () => void }) {
  const [list, setList] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<{ success: boolean; branches?: Branch[] }>(`${base}/branches`);
    setList(res.ok ? res.data?.branches ?? [] : []);
    setLoading(false);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (name.trim().length < 2) {
      setErr("نام شعبه را کامل وارد کنید.");
      return;
    }
    setErr("");
    setBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/branches`, {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), city: city.trim() || undefined, address: address.trim() || undefined, phone: phone.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "افزودن شعبه ممکن نشد (سقف پلن؟).");
      notify("ثبت نشد", "error");
      return;
    }
    notify("شعبه اضافه شد", "ok");
    setName("");
    setCity("");
    setAddress("");
    setPhone("");
    setOpen(false);
    void load();
    onChanged();
  }

  async function remove(id: string) {
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/branches/${id}`, { method: "DELETE" });
    if (!res.ok) {
      notify(res.data?.error || "حذف نشد", "error");
      return;
    }
    notify("حذف شد", "ok");
    void load();
    onChanged();
  }

  return (
    <div className="mini-card dash-pane">
      <SectionTitle
        title="شعبه‌ها"
        hint={`${faDigits(list.length)} شعبه`}
        action={
          <button type="button" className="mini-btn tiny" onClick={() => setOpen(true)}>
            <Icon name="plus" size={15} />
            شعبهٔ جدید
          </button>
        }
      />
      <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
        نوبت‌ها، ساعات کاری و کمیسیون هر شعبه جدا ثبت می‌شود؛ تعداد شعبه‌ها با پلن سالن محدود است.
      </div>

      {loading ? (
        <div style={{ marginTop: 12 }}>
          <SkeletonList count={2} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState text="شعبه‌ای ثبت نشده؛ نوبت‌ها به خودِ سالن می‌خورند." />
      ) : (
        <div className="mini-list" style={{ marginTop: 12 }}>
          {list.map((b) => (
            <div key={b.id} className="mini-item">
              <span className="mini-item-main">
                <span className="mini-item-title">{b.name}</span>
                <span className="mini-item-sub">
                  {joinLocation(b.city, b.address, " · ") || "بدون آدرس"}
                  {" · "}
                  {faDigits(b._count?.staff ?? 0)} کارکن · {faDigits(b._count?.appointments ?? 0)} نوبت
                </span>
              </span>
              <span className={`dash-tag${b.isActive === false ? " is-off" : ""}`}>{b.isActive === false ? "غیرفعال" : "فعال"}</span>
              <DeleteButton busy={busy} onConfirm={() => void remove(b.id)} />
            </div>
          ))}
        </div>
      )}

      <Sheet open={open} title="افزودن شعبه" onClose={() => setOpen(false)}>
        {err ? (
          <div className="mini-note dash-note-bad" style={{ marginBottom: 10 }}>
            {err}
          </div>
        ) : null}
        <div className="dash-form-gap">
          <Field label="نام شعبه" name="brName" value={name} onChange={(e) => setName(e.target.value)} placeholder="شعبهٔ مرکزی" />
          <Field label="شهر" name="brCity" value={city} onChange={(e) => setCity(e.target.value)} />
          <Field label="آدرس" name="brAddress" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Field label="تلفن (اختیاری)" name="brPhone" className="is-ltr" dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="021..." />
          <Button variant="primary" loading={busy} disabled={busy} onClick={() => void add()} className="dash-grow">
            <Icon name="plus" size={17} />
            افزودن
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/* ── پن: کمپین پیامک ──────────────────────────────────────────────── */

function CampaignsPane({ base, tz, salonName, notify }: { base: string; tz: string; salonName: string; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [list, setList] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [usage, setUsage] = useState<{ planLabel?: string; sms?: { used: number; limit: number | boolean }; campaigns?: { used: number; limit: number | boolean } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("SMS");
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [tplOpen, setTplOpen] = useState(false);
  const [confirmRun, setConfirmRun] = useState("");

  // همان fetch پنل، در قالبی که سازندهٔ مشترک بخش‌بندی انتظار دارد
  const call: SegCall = useCallback(
    (path, init) =>
      dapi(path, {
        method: init?.method,
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      }),
    []
  );
  const seg = useSegmentBuilder(base, call);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<{ success: boolean; campaigns?: Campaign[]; total?: number; totalPages?: number; usage?: any }>(
      `${base}/campaigns${qs({ page, limit: 25 })}`
    );
    if (res.ok) {
      setList(res.data?.campaigns ?? []);
      setTotal(Number(res.data?.total ?? 0));
      setTotalPages(Math.max(1, Number(res.data?.totalPages ?? Math.ceil((res.data?.total ?? 0) / 25))));
      setUsage(res.data?.usage ?? null);
    }
    setLoading(false);
  }, [base, page]);

  useEffect(() => {
    setPage(1);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const limitText = (v?: number | boolean): string => (typeof v === "number" ? faDigits(v) : "نامحدود");

  async function create() {
    if (!name.trim() || !message.trim()) {
      setErr("عنوان و متن کمپین را بنویسید.");
      return;
    }
    if (Boolean(schedDate) !== Boolean(schedTime)) {
      setErr("برای زمان‌بندی، تاریخ و ساعت هر دو پر شوند.");
      return;
    }
    let scheduledAt = "";
    if (schedDate && schedTime) {
      scheduledAt = safeIso(schedDate, schedTime, tz);
      if (!scheduledAt) {
        setErr("تاریخ یا ساعت نامعتبر است.");
        return;
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        setErr("زمان ارسال باید در آینده باشد.");
        return;
      }
    }
    setErr("");
    setBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/campaigns`, {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        channel: channel === "EMAIL" ? "EMAIL" : "SMS",
        ...seg.payload(),
        message: message.trim(),
        ...(scheduledAt ? { scheduledAt } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "ساخت کمپین ممکن نشد.");
      notify("ثبت نشد", "error");
      return;
    }
    notify(scheduledAt ? "کمپین زمان‌بندی شد" : "کمپین ساخته شد", "ok");
    setName("");
    setMessage("");
    setSchedDate("");
    setSchedTime("");
    void load();
  }

  async function run(id: string) {
    setBusy(true);
    setConfirmRun("");
    const res = await dapi<{ success: boolean; error?: string; recipients?: number; blocked?: number; warning?: string }>(`${base}/campaigns/${id}/run`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "ارسال شروع نشد.");
      notify("ارسال ناموفق", "error");
      void load();
      return;
    }
    const sent = Number(res.data?.recipients ?? 0);
    const blocked = Number(res.data?.blocked ?? 0);
    if (sent === 0) {
      setErr(res.data?.warning || "هیچ پیامکی ارسال نشد (سقف پلن یا مخاطب معتبر).");
      notify("ارسالی نشد", "error");
    } else if (blocked > 0) {
      setErr(`${toPersianDigits(sent)} مخاطب؛ ${res.data?.warning || `${toPersianDigits(blocked)} نفر ارسال نشد.`}`);
    } else {
      setErr("");
      notify(`${toPersianDigits(sent)} پیامک ارسال شد`, "ok");
    }
    void load();
  }

  return (
    <div className="mini-card dash-pane">
      <SectionTitle title="کمپین پیامک و ایمیل" hint={`${faDigits(total)} کمپین`} />
      <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
        عبارت <span dir="ltr">{"{salon}"}</span> هنگام ارسال خودکار با نام سالن جایگزین می‌شود. ارسال با سقف پیامک پلن محدود است.
      </div>

      {usage?.sms ? (
        <div className="mini-note" style={{ marginTop: 10 }}>
          مصرف این ماه: پیامک {faDigits(usage.sms.used)} از {limitText(usage.sms.limit)}
          {usage.campaigns ? ` · کمپین ${faDigits(usage.campaigns.used)} از ${limitText(usage.campaigns.limit)}` : ""}
          {usage.planLabel ? ` — پلن ${usage.planLabel}` : ""}
        </div>
      ) : null}

      <div className="dash-form-gap" style={{ marginTop: 12 }}>
        <Field label="عنوان کمپین" name="cpName" value={name} onChange={(e) => setName(e.target.value)} placeholder="تخفیف هفته" />
        <Area label="متن پیام" name="cpMessage" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="مشتری عزیز…" hint="حداکثر طول پیامک‌های استاندارد حدود ۱۶۰ حرف است." />
        <div className="mini-chips">
          <Chip on={channel === "SMS"} onClick={() => setChannel("SMS")}>
            پیامک
          </Chip>
          <Chip on={channel === "EMAIL"} onClick={() => setChannel("EMAIL")}>
            ایمیل
          </Chip>
        </div>
        <SegmentPanel seg={seg} />
        <div className="dash-two">
          <DateField
            label="زمان ارسال (اختیاری)"
            value={schedDate}
            onChange={setSchedDate}
            tz={tz}
            min={todayInZone(tz)}
            placeholder="بدون زمان‌بندی"
          />
          <Field label="ساعت ارسال" name="cpTime" type="time" className="is-ltr" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} />
        </div>
        {err ? <div className="mini-note dash-note-bad">{err}</div> : null}
        <Button variant="primary" loading={busy} disabled={busy} onClick={() => void create()} className="dash-grow">
          <Icon name="send" size={17} />
          {schedDate ? "زمان‌بندی کمپین" : "ساخت کمپین"}
        </Button>
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" className="mini-btn soft" style={{ width: "100%" }} onClick={() => setTplOpen((v) => !v)} aria-expanded={tplOpen}>
          <Icon name="sparkle" size={17} />
          قالب‌های آمادهٔ مناسبتی ({faDigits(CAMPAIGN_TEMPLATES.length)})
        </button>
        {tplOpen ? (
          <div className="mini-list" style={{ marginTop: 10 }}>
            {CAMPAIGN_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                className="mini-item"
                onClick={() => {
                  setName(tpl.name);
                  setMessage(tpl.text.replace("{salon}", salonName || "{salon}"));
                  setTplOpen(false);
                  notify(`قالب «${tpl.name}» در فرم قرار گرفت`, "ok");
                }}
              >
                <span className="mini-item-main">
                  <span className="mini-item-title">{tpl.name}</span>
                  <span className="mini-item-sub">{tpl.text}</span>
                </span>
                <Icon name="edit" size={16} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 14 }}>
        {loading ? (
          <SkeletonList count={2} />
        ) : list.length === 0 ? (
          <EmptyState text="کمپینی ثبت نشده است." hint="با قالب‌های آماده می‌توانید سریع شروع کنید." />
        ) : (
          <>
            <div className="mini-list">
              {list.map((c) => (
                <div key={c.id} className="mini-item" style={{ alignItems: "flex-start" }}>
                  <span className="mini-item-main">
                    <span className="mini-item-title">{c.name}</span>
                    <span className="mini-item-sub">
                      {c.channel === "EMAIL" ? "ایمیل" : "پیامک"} · {faText(c.segmentSummary) || SEGMENT_LABEL[(c.segment as SegmentKey)] || c.segment} ·{" "}
                      {faDigits(c.sentCount)} ارسال
                      {c.scheduledAt ? ` · زمان ارسال ${timeLabel(c.scheduledAt, tz)} ${formatJalali(ymd(new Date(c.scheduledAt), tz))}` : ""}
                      {c.sentAt ? ` · رفت ${formatJalali(ymd(new Date(c.sentAt), tz))}` : ""}
                    </span>
                  </span>
                  <span className={`dash-tag${c.status === "SENT" ? "" : " is-off"}`}>{CAMPAIGN_STATUS[c.status] ?? c.status}</span>
                  {c.status === "SENT" ? null : confirmRun === c.id ? (
                    <span className="dash-inline-actions">
                      <Button tiny loading={busy} onClick={() => void run(c.id)}>
                        <Icon name="send" size={15} />
                        ارسال
                      </Button>
                      <Button tiny variant="ghost" onClick={() => setConfirmRun("")}>
                        انصراف
                      </Button>
                    </span>
                  ) : (
                    <button type="button" className="mini-btn ghost tiny" disabled={busy} onClick={() => setConfirmRun(c.id)}>
                      ارسال الان
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} />
          </>
        )}
      </div>
      <div className="dash-section-note" style={{ marginTop: 12 }}>
        دکمهٔ «ارسال الان» برای کمپین پیش‌نویس یا زمان‌بندی‌شده پیامک را به صف می‌فرستد و از سقف پلن کم می‌شود.
      </div>
    </div>
  );
}

/* ── پن: صف انتظار ────────────────────────────────────────────────── */

function WaitlistPane({ slug, notify }: { slug: string; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [list, setList] = useState<WaitItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [onlyWaiting, setOnlyWaiting] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    const res = await dapi<{ success: boolean; entries?: WaitItem[]; total?: number; totalPages?: number }>(
      `/api/salons/${slug}/waitlist${qs({ page, limit: 25, status: onlyWaiting ? "WAITING" : undefined })}`
    );
    if (res.ok) {
      setList(res.data?.entries ?? []);
      setTotal(Number(res.data?.total ?? 0));
      setTotalPages(Math.max(1, Number(res.data?.totalPages ?? 1)));
    }
    setLoading(false);
  }, [slug, page, onlyWaiting]);

  useEffect(() => {
    setPage(1);
  }, [slug, onlyWaiting]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(id: string) {
    setBusyId(id);
    const res = await dapi<{ success: boolean; error?: string }>(`/api/salons/${slug}/waitlist/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "NOTIFIED" }),
    });
    setBusyId("");
    if (!res.ok) {
      notify(res.data?.error || "ثبت نشد", "error");
      return;
    }
    setList((prev) => prev.map((x) => (x.id === id ? { ...x, status: "NOTIFIED" } : x)));
    notify("اطلاع‌رسانی شد", "ok");
  }

  if (!slug) {
    return (
      <div className="mini-card dash-pane">
        <EmptyState text="برای دیدن صف انتظار، سالن را انتخاب کنید." />
      </div>
    );
  }

  return (
    <div className="mini-card dash-pane">
      <SectionTitle title="صف انتظار" hint={`${faDigits(total)} نفر`} />
      <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
        وقتی روزی پر است، مشتری در صف می‌ماند؛ بعد از خالی‌شدن ساعت یا اطلاع‌رسانی دستی، وضعیتش را همین‌جا تغییر دهید.
      </div>
      <div className="mini-chips" style={{ marginTop: 10 }}>
        <Chip on={!onlyWaiting} onClick={() => setOnlyWaiting(false)}>
          همه
        </Chip>
        <Chip on={onlyWaiting} onClick={() => setOnlyWaiting(true)}>
          فقط در انتظار
        </Chip>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <SkeletonList count={3} />
        ) : list.length === 0 ? (
          <EmptyState text="کسی در صف انتظار نیست." />
        ) : (
          <>
            <div className="mini-list">
              {list.map((e) => (
                <div key={e.id} className="mini-item">
                  <span className="mini-item-main">
                    <span className="mini-item-title">{e.customerName}</span>
                    <span className="mini-item-sub" dir="rtl">
                      <span dir="ltr">{e.customerPhone}</span> · {e.note || "بدون توضیح"}
                    </span>
                  </span>
                  <span className={`dash-tag${e.status === "WAITING" ? "" : " is-off"}`}>{WAITLIST_STATUS[e.status] ?? e.status}</span>
                  {e.status === "WAITING" ? (
                    <button type="button" className="mini-btn tiny" disabled={busyId === e.id} onClick={() => void mark(e.id)}>
                      {busyId === e.id ? "…" : "اطلاع‌رسانی شد"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}

/* ── پن: ورود و خروج داده ─────────────────────────────────────────── */

function DataPane({ base, notify }: { base: string; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [kind, setKind] = useState<"customers" | "appointments">("customers");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState("");

  async function importData() {
    if (!raw.trim()) {
      setErr("آرایهٔ JSON را در کادر وارد کنید.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setErr("JSON معتبر نیست؛ با «نمونهٔ آماده» شروع کنید.");
      return;
    }
    const rows = Array.isArray(parsed) ? parsed : (parsed as { rows?: unknown }).rows;
    if (!Array.isArray(rows) || !rows.length) {
      setErr("هیچ ردیفی پیدا نشد (آرایهٔ خالی یا فیلد rows).");
      return;
    }
    if (rows.length > 5000) {
      setErr("حداکثر ۵۰۰۰ ردیف در هر بار.");
      return;
    }
    setErr("");
    setBusy(true);
    setResult("");
    const res = await dapi<{
      success: boolean;
      error?: string;
      created?: number;
      updated?: number;
      blocked?: number;
      warning?: string | null;
      imported?: number;
      total?: number;
      errors?: string[];
    }>(`${base}/import/${kind}`, { method: "POST", body: JSON.stringify({ rows }) });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "وارد کردن داده ممکن نشد.");
      notify("وارد نشد", "error");
      return;
    }
    const parts: string[] = [];
    if (res.data?.created !== undefined) parts.push(`${faDigits(res.data.created)} جدید`);
    if (res.data?.updated !== undefined) parts.push(`${faDigits(res.data.updated)} به‌روز`);
    if (res.data?.imported !== undefined) parts.push(`${faDigits(res.data.imported)} نوبت`);
    if (res.data?.blocked) parts.push(`${faDigits(res.data.blocked)} به سقف پلن رسید`);
    const errs = Array.isArray(res.data?.errors) ? res.data.errors.filter(Boolean).slice(0, 3) : [];
    if (errs.length) parts.push(`${faDigits(errs.length)} ردیف خطا داشت`);
    setResult(`${parts.join(" · ") || "انجام شد"}`);
    if (res.data?.warning) {
      setErr(res.data.warning);
      notify("بخشی وارد شد", "error");
    } else {
      notify("داده وارد شد", "ok");
    }
  }

  return (
    <div className="mini-card dash-pane">
      <SectionTitle title="خروجی و ورود داده" />
      <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
        فایل اکسل/CSV نوبت‌ها و مشتریان را از این‌جا بگیرید؛ برای انتقال سابقه، ردیف‌ها را به شکل JSON نمونه وارد کنید.
      </div>
      <div className="mini-btn-row" style={{ marginTop: 12 }}>
        <a className="mini-btn tiny" href={`${base}/excel?type=appointments`} target="_blank" rel="noreferrer">
          <Icon name="calendar" size={16} />
          خروجی نوبت‌ها
        </a>
        <a className="mini-btn soft tiny" href={`${base}/excel?type=customers`} target="_blank" rel="noreferrer">
          <Icon name="users" size={16} />
          خروجی مشتریان
        </a>
      </div>

      <div className="mini-chips" style={{ marginTop: 14 }}>
        <Chip on={kind === "customers"} onClick={() => setKind("customers")}>
          ورود مشتریان
        </Chip>
        <Chip on={kind === "appointments"} onClick={() => setKind("appointments")}>
          ورود نوبت‌های قدیمی
        </Chip>
        <button type="button" className="mini-btn ghost tiny" onClick={() => setRaw(IMPORT_SAMPLES[kind])}>
          نمونهٔ آماده
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <Area
          label="ردیف‌ها (JSON)"
          name="mgImport"
          rows={6}
          className="is-ltr"
          dir="ltr"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={IMPORT_SAMPLES[kind]}
          hint={
            kind === "customers"
              ? "فیلدها: phone (09xxxxxxxxx الزامی)، name، visits، spend، note، tags — سقف تعداد مشتری از پلن."
              : "فیلدها: customerName، customerPhone، startAt (ISO)، endAt یا durationMin، serviceId، employeeId، status (پیش‌فرض COMPLETED)، note."
          }
        />
      </div>

      {err ? (
        <div className="mini-note dash-note-bad" style={{ marginTop: 10 }}>
          {err}
        </div>
      ) : null}
      {result ? (
        <div className="mini-note dash-note-ok" style={{ marginTop: 10 }}>
          {result}
        </div>
      ) : null}

      <Button variant="primary" loading={busy} disabled={busy} onClick={() => void importData()} className="dash-grow">
        <Icon name="plus" size={17} />
        {busy ? "در حال وارد کردن…" : "وارد کردن"}
      </Button>
      <div className="dash-section-note" style={{ marginTop: 12 }}>
        «وارد کردن» مجددِ همان شماره تلفن، مشتری موجود را به‌روز می‌کند و رکورد تکراری نمی‌سازد.
      </div>
    </div>
  );
}

/* ── صفحه ─────────────────────────────────────────────────────────── */

export default function DashManagement() {
  const navigate = useNavigate();
  const { salon, salonId, canManage, toast } = useDash();
  const [pane, setPane] = useState<Pane>("calendar");
  const [refs, setRefs] = useState<{ staff: Ref[]; services: Ref[]; branches: Branch[] }>({ staff: [], services: [], branches: [] });
  const [waitingCount, setWaitingCount] = useState(0);

  const base = useMemo(() => (salonId ? `/api/dashboard/salons/${salonId}` : ""), [salonId]);
  const tz = salon?.timezone ?? "Asia/Tehran";
  const slug = String(salon?.slug ?? "");

  const reloadRefs = useCallback(async () => {
    if (!base) {
      setRefs({ staff: [], services: [], branches: [] });
      return;
    }
    const [st, sv, br] = await Promise.all([
      dapi<{ success: boolean; staff?: Ref[] }>(`${base}/staff`),
      dapi<{ success: boolean; services?: Ref[] }>(`${base}/services`),
      dapi<{ success: boolean; branches?: Branch[] }>(`${base}/branches`),
    ]);
    setRefs({
      staff: st.ok ? st.data?.staff ?? [] : [],
      services: sv.ok ? sv.data?.services ?? [] : [],
      branches: br.ok ? br.data?.branches ?? [] : [],
    });
  }, [base]);

  useEffect(() => {
    void reloadRefs();
  }, [reloadRefs]);

  /* شمارندِ تب صف انتظار */
  useEffect(() => {
    if (!slug) {
      setWaitingCount(0);
      return;
    }
    let alive = true;
    void (async () => {
      const res = await dapi<{ success: boolean; total?: number }>(`/api/salons/${slug}/waitlist${qs({ status: "WAITING", limit: 1 })}`);
      if (alive && res.ok) setWaitingCount(Number(res.data?.total ?? 0));
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  if (!salonId || !canManage) {
    return (
      <div className="mini-fade">
        <div className="dash-toolbar">
          <SectionTitle title="مدیریت سالن" hint="نیاز به دسترسی مدیریت سالن دارد." />
          <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
            <SalonSwitcher />
          </div>
        </div>
        <EmptyState text="سالنی برای مدیریت انتخاب نشده است." hint="از «سالن من» می‌توانید سالن بسازید یا انتخاب کنید." />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="مدیریت سالن" hint={salon?.name ? `برای ${salon.name}` : undefined} />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          <button type="button" className="mini-btn ghost tiny" onClick={() => void reloadRefs()} aria-label="نوسازی">
            <Icon name="refresh" size={15} />
          </button>
          <SalonSwitcher />
        </div>
      </div>

      <div className="dash-tabs" style={{ marginTop: 12 }}>
        <Tabs<Pane>
          value={pane}
          onChange={setPane}
          items={[
            { id: "calendar", label: "تقویم", icon: "calendar" },
            { id: "holidays", label: "تعطیلات", icon: "clock" },
            { id: "blocks", label: "بازه‌های مسدود", icon: "stop" },
            { id: "branches", label: "شعبه‌ها", icon: "store" },
            { id: "campaigns", label: "کمپین", icon: "send" },
            { id: "waitlist", label: "صف انتظار", icon: "users", badge: waitingCount },
            { id: "data", label: "داده", icon: "ticket" },
          ]}
        />
      </div>

      {pane === "calendar" ? <CalendarPane tz={tz} salonId={salonId} staff={refs.staff} services={refs.services} /> : null}
      {pane === "holidays" ? <HolidaysPane base={base} tz={tz} branches={refs.branches} notify={toast} /> : null}
      {pane === "blocks" ? <BlocksPane base={base} tz={tz} staff={refs.staff} notify={toast} /> : null}
      {pane === "branches" ? <BranchesPane base={base} notify={toast} onChanged={reloadRefs} /> : null}
      {pane === "campaigns" ? <CampaignsPane base={base} tz={tz} salonName={salon?.name ?? ""} notify={toast} /> : null}
      {pane === "waitlist" ? <WaitlistPane slug={slug} notify={toast} /> : null}
      {pane === "data" ? <DataPane base={base} notify={toast} /> : null}

      <SectionTitle title="بخش‌های مرتبط" hint="ادامهٔ مدیریت همین سالن" />
      <div className="dash-tiles" style={{ marginTop: 10 }}>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/appointments")}>
          <span className="dash-tile-icon">
            <Icon name="calendar" size={18} />
          </span>
          <span className="dash-tile-title">تقویم روز</span>
          <span className="dash-tile-sub">نوبت‌ها، یادآوری‌ها و کارهای روی صندلی</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/settings")}>
          <span className="dash-tile-icon">
            <Icon name="clock" size={18} />
          </span>
          <span className="dash-tile-title">ساعات کاری و قوانین</span>
          <span className="dash-tile-sub">برنامهٔ هفتگی، بیعانه، دامنه</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/booking")}>
          <span className="dash-tile-icon">
            <Icon name="plus" size={18} />
          </span>
          <span className="dash-tile-title">رزرو دستی</span>
          <span className="dash-tile-sub">ثبت نوبت تلفنی برای مشتری</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/staff")}>
          <span className="dash-tile-icon">
            <Icon name="scissors" size={18} />
          </span>
          <span className="dash-tile-title">کارکنان و شیفت</span>
          <span className="dash-tile-sub">مرخصی و برنامهٔ هفتگی هر آرایشگر</span>
        </button>
      </div>

      <div className="dash-section-note" style={{ marginTop: 14 }}>
        حذفِ خودِ سالن و تغییر پلن از پنل وب/سوپرادمین انجام می‌شود:{" "}
        <a href="/dashboard/management" style={{ fontWeight: 800 }}>
          نسخهٔ وب مدیریت
        </a>
      </div>
    </div>
  );
}
