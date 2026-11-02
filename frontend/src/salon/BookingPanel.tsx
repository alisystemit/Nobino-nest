/**
 * پنل رزرو صفحهٔ عمومی سالن — همان جریان مینی‌اپ (چند خدمت، آرایشگر،
 * نوار ۱۴ روز، ساعت‌های واقعاً آزاد، نزدیک‌ترین وقت، لیست انتظار) به‌علاوهٔ
 * امکانی که فقط نسخهٔ وب داشت: رزرو صوتی، انتخاب شعبه و تقویم شمسیِ بازهٔ
 * رزرو سالن. ثبت نوبت از همان `POST /api/appointments` سایت انجام می‌شود.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";
import {
  DayStrip,
  ServicePicker,
  SlotGrid,
  StaffPicker,
  WaitlistSheet,
  eligibleStaff,
  upcomingDays,
} from "@/mini/components/booking";
import { Button, Field, Icon, Row, SectionTitle, Sheet } from "@/mini/components/ui";
import { haptic } from "@/mini/lib/bridge";
import { dayLabel, duration, faDigits, isPhone, normalizePhone, timeLabel, toman, weekdayLabel, ymd } from "@/mini/lib/format";
import { mapi, useMini } from "@/mini/lib/store";
import type { AvailabilityResponse, MiniService, MiniStaff } from "@/mini/lib/types";
import VoiceBooking, { type VoicePatch } from "./VoiceBooking";
import { siteHref } from "./site-url";

const DAYS_SHOWN = 14;

function latinDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

function localHHMM(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/** اسلات آزادِ مطابق ساعت استخراج‌شده از صوت */
function matchSlot(wanted: string | null, list: { startAt: string }[], tz: string): string | null {
  if (!wanted || !list.length) return null;
  const needle = latinDigits(wanted).slice(0, 5);
  const hit = list.find((s) => latinDigits(localHHMM(s.startAt, tz)).slice(0, 5) === needle) ?? list[0];
  return hit.startAt;
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** «دوشنبه ۱۱ آبان — ساعت ۱۸:۳۰» در ساعتِ خودِ سالن (بدون سال، مثل بقیهٔ صفحه) */
function whenLabel(iso: string, tz: string): string {
  const key = ymd(new Date(iso), tz);
  return `${weekdayLabel(key, tz)} ${dayLabel(key, tz)} — ساعت ${timeLabel(iso, tz)}`;
}

export type BookingPreset = { serviceId?: string; staffId?: string; day?: string; nonce: number };

/**
 * خلاصهٔ نوبت با همان ظاهِ کارت‌های مینی‌اپ.
 * نسخهٔ مینی‌اپ (`BookingSummary`) ساعت و روز را در منطقهٔ زمانیِ مرورگر می‌خواند،
 * پس برای بازدیدکننده‌ای که ساعتش با سالن یکی نیست «۱۸:۰۰» را «۰۶:۳۰» نشان می‌دهد.
 * این نسخه دقیقاً همان ردیف‌ها را با ساعتِ خودِ سالن می‌سازد؛ هیچ فایلی در
 * frontend/src/mini برای این کار تغییر نکرده است.
 */
function SummaryCard({
  services,
  staffName,
  minutes,
  price,
  when,
  timezone,
  showPrices,
}: {
  services: string[];
  staffName: string;
  minutes: number;
  price: number;
  when: string;
  timezone: string;
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
          <span>{whenLabel(when, timezone)}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function BookingPanel({
  salon,
  services,
  staff,
  branches = [],
  showPrices,
  bookingEnabled,
  requireLogin,
  preset,
  onLoginRequired,
  onBooked,
}: {
  salon: { id: string; slug: string; name: string; timezone: string; maxAdvanceDays?: number | null; phone?: string | null };
  services: MiniService[];
  staff: MiniStaff[];
  branches?: { id: string; name: string; city?: string | null }[];
  showPrices: boolean;
  bookingEnabled: boolean;
  requireLogin: boolean;
  preset?: BookingPreset;
  onLoginRequired: () => void;
  onBooked?: () => void;
}) {
  const { me, profile, saveProfile, toast } = useMini();

  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [day, setDay] = useState("");
  const [startAt, setStartAt] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [finding, setFinding] = useState(false);
  const [waitOpen, setWaitOpen] = useState(false);
  const [done, setDone] = useState<{ id: string; startAt: string } | null>(null);

  // فقط «مشتری» نام/شماره از حسابش پیش‌پر می‌شود؛ سالن‌دار برای مشتریِ دیگری رزرو می‌کند.
  const isCustomer = me?.role === "CUSTOMER";
  const [name, setName] = useState(isCustomer ? (profile.name || me?.name || "") : "");
  const [phone, setPhone] = useState(isCustomer ? (profile.phone || me?.phone || "") : "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const voiceTimeRef = useRef<string | null>(null);
  const appliedPreset = useRef(0);

  const timezone = availability?.timezone || salon.timezone || "Asia/Tehran";
  const days = useMemo(() => upcomingDays(DAYS_SHOWN, timezone), [timezone]);
  const today = useMemo(() => ymd(new Date(), timezone), [timezone]);
  const maxDate = useMemo(() => addDaysISO(today, Math.max(1, Number(salon.maxAdvanceDays ?? 60))), [today, salon.maxAdvanceDays]);

  const pickedServices = useMemo(() => services.filter((s) => serviceIds.includes(s.id)), [services, serviceIds]);
  const shownStaff = useMemo(() => eligibleStaff(staff, serviceIds), [staff, serviceIds]);
  const staffStillValid = staffId === "" || shownStaff.some((s) => s.id === staffId);

  const totals = availability?.totals ?? {
    durationMin: pickedServices.reduce((a, s) => a + s.durationMin, 0),
    bufferMin: 0,
    price: pickedServices.reduce((a, s) => a + s.price, 0),
  };

  /* ── روز پیش‌فرض = نزدیک‌ترین روز ─────────────────────────────────── */
  useEffect(() => {
    if (!day && days.length) setDay(days[0]);
  }, [day, days]);

  /* ── پیش‌انتخاب از بیرون (کلیک روی پکیج یا آرایشگر) ─────────────── */
  useEffect(() => {
    if (!preset || preset.nonce === appliedPreset.current) return;
    appliedPreset.current = preset.nonce;
    if (preset.serviceId && services.some((s) => s.id === preset.serviceId)) {
      setServiceIds((prev) => (prev.includes(preset.serviceId!) ? prev : [...prev, preset.serviceId!]));
      setStartAt("");
    }
    if (preset.staffId && staff.some((s) => s.id === preset.staffId)) setStaffId(preset.staffId);
    if (preset.day) setDay(preset.day);
  }, [preset, services, staff]);

  /* ── پر شدن تدریجی فرم از صوت/حساب ───────────────────────────────── */
  useEffect(() => {
    if (!isCustomer) return;
    setName((prev) => prev || me?.name || profile.name);
    setPhone((prev) => prev || me?.phone || profile.phone);
  }, [isCustomer, me?.name, me?.phone, profile.name, profile.phone]);

  /* ── ساعت‌های خالی ────────────────────────────────────────────────── */
  const loadSlots = useCallback(async () => {
    if (!serviceIds.length || !day) {
      setAvailability(null);
      return;
    }
    setSlotsLoading(true);
    const params = new URLSearchParams({ date: day, serviceIds: serviceIds.join(",") });
    if (staffStillValid && staffId) params.set("employeeId", staffId);
    if (branchId) params.set("branchId", branchId);
    const res = await mapi<AvailabilityResponse>(`/api/salons/${encodeURIComponent(salon.slug)}/availability?${params.toString()}`);
    if (!res.ok) {
      setAvailability(null);
      toast(res.data?.error || "محاسبهٔ ساعت‌های خالی ممکن نشد", "error");
    } else {
      setAvailability(res.data);
      // ساعتی که صوت استخراج کرده بود، روی اولین اسلات مطابق نشسته می‌شود
      if (voiceTimeRef.current) {
        const hit = matchSlot(voiceTimeRef.current, res.data.slots ?? [], timezone);
        if (hit) {
          setStartAt(hit);
          voiceTimeRef.current = null;
        }
      }
    }
    setSlotsLoading(false);
  }, [serviceIds, day, staffId, staffStillValid, branchId, salon.slug, toast, timezone]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  /* ساعت انتخابی در فهرست تازه نیست → پاک می‌شود */
  useEffect(() => {
    if (!startAt) return;
    if (availability && !availability.slots.some((s) => s.startAt === startAt)) setStartAt("");
  }, [availability, startAt]);

  const dayIsFull = Boolean(day && serviceIds.length && !slotsLoading && availability && availability.slots.length === 0);

  /* ── نزدیک‌ترین وقت خالی در روزهای پیش‌رو ─────────────────────────── */
  async function findNearestSlot() {
    if (!serviceIds.length) {
      toast("اول یک پکیج انتخاب کنید", "error");
      return;
    }
    setFinding(true);
    const startIndex = Math.max(0, days.indexOf(day || days[0]));
    for (let i = startIndex; i < days.length; i++) {
      const params = new URLSearchParams({ date: days[i], serviceIds: serviceIds.join(",") });
      if (staffStillValid && staffId) params.set("employeeId", staffId);
      if (branchId) params.set("branchId", branchId);
      const res = await mapi<AvailabilityResponse>(`/api/salons/${encodeURIComponent(salon.slug)}/availability?${params.toString()}`);
      const slot = res.ok ? res.data?.slots?.[0] : undefined;
      if (slot) {
        setDay(days[i]);
        setStartAt(slot.startAt);
        haptic("success");
        toast(`نزدیک‌ترین وقت خالی: ${dayLabel(days[i], timezone)} — ${timeLabel(slot.startAt, timezone)}`, "ok");
        setFinding(false);
        return;
      }
    }
    setFinding(false);
    toast("در این بازه وقت خالی نیست؛ در لیست انتظار ثبت شوید", "info");
    setWaitOpen(true);
  }

  /* ── ثبت نوبت ─────────────────────────────────────────────────────── */
  async function submit() {
    if (!bookingEnabled) {
      toast("رزرو آنلاین در این سالن غیرفعال است", "error");
      return;
    }
    if (!serviceIds.length) return toast("حداقل یک پکیج انتخاب کنید", "error");
    if (!day || !startAt) return toast("روز و ساعت را انتخاب کنید", "error");
    if (requireLogin && !me) {
      onLoginRequired();
      return;
    }
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    if (cleanName.length < 2) return toast("نام را کامل بنویسید", "error");
    if (!isPhone(cleanPhone)) return toast("شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)", "error");

    setSubmitting(true);
    const res = await mapi<{ success: boolean; error?: string; appointment?: { id: string; startAt: string } }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        salonId: salon.id,
        serviceIds,
        employeeId: staffStillValid && staffId ? staffId : undefined,
        branchId: branchId || undefined,
        customerName: cleanName,
        customerPhone: cleanPhone,
        startAt,
        channel: "WEBAPP",
        note: note.trim() || undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok || !res.data.appointment) {
      toast(res.data?.error || "ثبت نوبت ممکن نشد؛ دوباره تلاش کنید", "error");
      return;
    }
    saveProfile({ name: cleanName, phone: cleanPhone });
    haptic("success");
    setDone(res.data.appointment);
    setNote("");
    setStartAt("");
    onBooked?.();
  }

  function applyVoice(patch: VoicePatch) {
    if (patch.name) setName(patch.name);
    if (patch.phone) setPhone(patch.phone);
    if (patch.date) setDay(patch.date);
    if (patch.time) voiceTimeRef.current = patch.time;
    if (patch.service) {
      const wanted = patch.service.trim();
      const hit = services.find((s) => s.name.includes(wanted) || wanted.includes(s.name));
      if (hit) {
        setServiceIds([hit.id]);
        setStartAt("");
      }
    }
  }

  const canBook = Boolean(bookingEnabled && serviceIds.length && day && startAt);

  return (
    <>
      <div className="sm-book-card" id="sm-booking">
        <div className="sm-book-head">
          <Icon name="calendar" size={20} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <b>رزرو نوبت</b>
            <span>پکیج (یکی یا چند مورد)، روز و ساعتِ واقعاً آزاد را انتخاب کنید</span>
          </div>
          {branchId ? (
            <span className="mini-tag">{branches.find((b) => b.id === branchId)?.name ?? "شعبه"}</span>
          ) : null}
        </div>

        <VoiceBooking salonId={salon.id} phone={phone} onApply={applyVoice} onNotice={(t, k) => toast(t, k ?? "info")} />

        {branches.length > 1 ? (
          <>
            <SectionTitle title="شعبه" hint="اختیاری" />
            <div className="mini-chips">
              <button type="button" className={`mini-chip${branchId === "" ? " is-on" : ""}`} onClick={() => { setBranchId(""); setStartAt(""); }}>
                همهٔ شعبه‌ها
              </button>
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`mini-chip${branchId === b.id ? " is-on" : ""}`}
                  onClick={() => { setBranchId(b.id); setStartAt(""); }}
                >
                  {b.name}
                  {b.city ? ` — ${b.city}` : ""}
                </button>
              ))}
            </div>
          </>
        ) : null}

        <SectionTitle title="پکیج مورد نظر" hint={serviceIds.length ? `${faDigits(serviceIds.length)} انتخاب` : "یکی یا چند مورد"} />
        {services.length === 0 ? (
          <div className="mini-note">این سالن هنوز پکیجی تعریف نکرده است؛ برای نوبت سرخود با سالن تماس بگیرید.</div>
        ) : (
          <ServicePicker
            services={services}
            selected={serviceIds}
            showPrices={showPrices}
            onToggle={(id) => {
              setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
              setStartAt("");
            }}
          />
        )}

        {serviceIds.length > 1 ? (
          <div className="mini-note" style={{ marginTop: 10 }}>
            مجموع {faDigits(totals.durationMin)} دقیقه{showPrices ? ` · ${toman(totals.price)}` : ""}
            {availability?.totals?.bufferMin ? ` · فاصلهٔ بین خدمات ${faDigits(availability.totals.bufferMin)} دقیقه` : ""}
          </div>
        ) : null}

        {staff.length ? (
          <>
            <SectionTitle title="آرایشگر" hint="اختیاری" />
            <StaffPicker
              staff={shownStaff}
              value={staffStillValid ? staffId : ""}
              onChange={(id) => {
                setStaffId(id);
                setStartAt("");
              }}
            />
          </>
        ) : null}

        {bookingEnabled ? (
          <>
            <SectionTitle title="روز" hint={`${faDigits(DAYS_SHOWN)} روز پیش‌رو`} />
            <DayStrip
              days={days}
              value={day || days[0]}
              timezone={timezone}
              onChange={(d) => {
                setDay(d);
                setStartAt("");
              }}
            />
            <div style={{ marginTop: 10 }}>
              <JalaliDatePicker
                value={day}
                onChange={(d) => {
                  setDay(d);
                  setStartAt("");
                }}
                min={today}
                max={maxDate}
                timeZone={timezone}
                placeholder="تاریخ دلخواه (شمسی)"
                className="mini-input"
              />
            </div>

            <SectionTitle title="ساعت" hint={day ? dayLabel(day, timezone) : "یک روز انتخاب کنید"} />
            <SlotGrid
              slots={availability?.slots ?? []}
              value={startAt}
              timezone={timezone}
              loading={slotsLoading}
              emptyText={
                day && serviceIds.length
                  ? "در این روز وقت خالی نیست؛ راه‌های سریع‌تر را پایین ببینید."
                  : "برای دیدن ساعت‌های خالی، پکیج و روز را انتخاب کنید."
              }
              onSelect={(iso) => {
                voiceTimeRef.current = null;
                setStartAt(iso);
                haptic("light");
              }}
            />

            {dayIsFull ? (
              <div className="mini-quick" style={{ marginTop: 12 }}>
                <Button variant="soft" loading={finding} onClick={() => void findNearestSlot()}>
                  <Icon name="bolt" size={17} />
                  نزدیک‌ترین وقت خالی
                </Button>
                <Button variant="ghost" onClick={() => setWaitOpen(true)}>
                  <Icon name="bell" size={17} />
                  لیست انتظار
                </Button>
              </div>
            ) : null}

            {!dayIsFull && serviceIds.length && day ? (
              <div style={{ textAlign: "center", marginTop: 10 }}>
                <button type="button" className="mini-more" onClick={() => setWaitOpen(true)}>
                  ساعت دلخواهتان خالی نیست؟ در لیست انتظار بمانید
                </button>
              </div>
            ) : null}

            <WaitlistSheet
              open={waitOpen}
              slug={salon.slug}
              salonName={salon.name}
              serviceIds={serviceIds}
              serviceNames={pickedServices.map((s) => s.name)}
              employeeId={staffStillValid ? staffId : ""}
              day={day}
              timezone={timezone}
              onClose={() => setWaitOpen(false)}
            />
          </>
        ) : (
          <div className="mini-note" style={{ marginTop: 14 }}>
            رزرو آنلاین برای این سالن غیرفعال شده است؛ برای نوبت با سالن تماس بگیرید.
          </div>
        )}

        {bookingEnabled && serviceIds.length ? (
          <>
            <SectionTitle title="خلاصهٔ نوبت" />
            <SummaryCard
              services={pickedServices.map((s) => s.name)}
              price={totals.price}
              minutes={totals.durationMin}
              when={startAt}
              timezone={timezone}
              staffName={shownStaff.find((s) => s.id === staffId)?.name ?? ""}
              showPrices={showPrices}
            />
          </>
        ) : null}

        {bookingEnabled ? (
          <>
            <SectionTitle title="مشخصات شما" hint={me ? "از حساب شما پر شده" : "برای پیامک تأیید"} />
            <div className="mini-card" style={{ padding: 12 }}>
              <Field label="نام و نام خانوادگی" name="bk_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً مریم رضایی" autoComplete="name" />
              <Field
                label="شماره موبایل"
                name="bk_phone"
                dir="ltr"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09123456789"
                autoComplete="tel"
              />
              <Field label="توضیح اختیاری" name="bk_note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً زنگ بزنید" />
              {!me ? (
                <button type="button" className="mini-more" onClick={onLoginRequired}>
                  ورود با کد پیامکی (نوبت‌هایتان در حساب شما ثبت می‌شود)
                </button>
              ) : null}
            </div>

            <div style={{ marginTop: 12 }}>
              <Button onClick={() => void submit()} disabled={!canBook} loading={submitting}>
                <Icon name="check" size={18} />
                {startAt
                  ? `ثبت نوبت · ${dayLabel(day, timezone)} ساعت ${timeLabel(startAt, timezone)}`
                  : !serviceIds.length
                    ? "یک پکیج را انتخاب کنید"
                    : !day
                      ? "یک روز را انتخاب کنید"
                      : "یک ساعت خالی را انتخاب کنید"}
              </Button>
              <div className="mini-option-sub" style={{ marginTop: 8, textAlign: "center", lineHeight: 1.9 }}>
                بعد از ثبت، پیامک تأیید و یادآوری برای شما ارسال می‌شود.
              </div>
            </div>
          </>
        ) : salon.phone ? (
          <div style={{ marginTop: 12 }}>
            <a className="mini-btn" href={`tel:${salon.phone}`} style={{ textDecoration: "none" }}>
              <Icon name="phone" size={18} />
              تماس با سالن
            </a>
          </div>
        ) : null}
      </div>

      {/* شیت موفقیت */}
      <Sheet open={Boolean(done)} title="نوبت شما ثبت شد" onClose={() => setDone(null)}>
        {done ? (
          <>
            <div className="mini-note" style={{ marginBottom: 12 }}>
              کد پیگیری: <b className="mini-code">{done.id.slice(0, 8)}</b>
            </div>
            <Row label="سالن" value={salon.name} />
            <Row label="زمان" value={whenLabel(done.startAt, timezone)} />
            <Row label="پکیج‌ها" value={pickedServices.map((s) => s.name).join("، ") || "—"} />
            <div className="mini-btn-row" style={{ marginTop: 14 }}>
              <Button variant="ghost" onClick={() => setDone(null)}>
                بستن
              </Button>
              {me ? (
                <a className="mini-btn" href={siteHref("/dashboard/appointments")} style={{ textDecoration: "none" }}>
                  نوبت‌های من
                </a>
              ) : (
                <Button onClick={onLoginRequired}>ورود برای دیدن نوبت‌ها</Button>
              )}
            </div>
            <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center", lineHeight: 1.9 }}>
              برای جابه‌جایی یا لغو نوبت، از بخش «نوبت بعدی شما» در همین صفحه یا پنل کاربری استفاده کنید.
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
