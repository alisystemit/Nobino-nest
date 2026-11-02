/**
 * صفحهٔ سالن در مینی‌اپ — انتخاب خدمت و آرایشگر، روز و ساعت، و ثبت نوبت.
 * ثبت نوبت از همان `POST /api/appointments` سایت انجام می‌شود (با channel=WEBAPP)
 * تا قوانین سالن، قفل هم‌زمان و پیامک تأیید یکسان بماند.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import LoginSheet from "../components/login-sheet";
import { BookingSummary, DayStrip, ServicePicker, SlotGrid, StaffPicker, WaitlistSheet, eligibleStaff, upcomingDays } from "../components/booking";
import { Button, EmptyState, Field, Icon, Row, SectionTitle, Sheet, SkeletonList, StarIcon } from "../components/ui";
import { closeMiniApp, haptic } from "../lib/bridge";
import { dayLabel, faDigits, isPhone, normalizePhone, ratingText, timeLabel, toman } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import type { AvailabilityResponse, MiniReview, MiniSalonDetail, MiniService, MiniStaff } from "../lib/types";

const DAYS_SHOWN = 14;

export default function MiniSalon() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { config, configReady, me, draft, setDraft, resetDraft, toast, profile, saveProfile } = useMini();

  const [salon, setSalon] = useState<MiniSalonDetail | null>(null);
  const [staff, setStaff] = useState<MiniStaff[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [serviceIds, setServiceIds] = useState<string[]>(draft.slug === slug ? draft.serviceIds : []);
  const [staffId, setStaffId] = useState(draft.slug === slug ? draft.staffId : "");
  const [day, setDay] = useState(draft.slug === slug ? draft.date : "");
  const [startAt, setStartAt] = useState(draft.slug === slug ? draft.startAt : "");

  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [reviews, setReviews] = useState<MiniReview[]>([]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [name, setName] = useState(me?.name || profile.name);
  const [phone, setPhone] = useState(profile.phone || me?.phone || "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ id: string; startAt: string } | null>(null);
  const [waitOpen, setWaitOpen] = useState(false);
  const [finding, setFinding] = useState(false);

  const timezone = availability?.timezone || draft.timezone || "Asia/Tehran";
  const days = useMemo(() => upcomingDays(DAYS_SHOWN, timezone), [timezone]);
  const showPrices = config.brand.showPrices;

  /* ── روز پیش‌فرض = نزدیک‌ترین روز، تا کاربر خودش چیزی انتخاب کند ─── */
  useEffect(() => {
    if (!day && days.length) setDay(days[0]);
  }, [day, days]);

  /* ── ?service=<id> — وقتی از خانه روی یک پکیج زده شده، همان انتخاب می‌شود ── */
  const [searchParams] = useSearchParams();
  const presetService = (searchParams.get("service") ?? "").trim();
  const presetApplied = useRef("");
  useEffect(() => {
    if (!presetService || !salon || presetApplied.current === `${slug}:${presetService}`) return;
    if (!salon.services.some((s) => s.id === presetService)) return;
    presetApplied.current = `${slug}:${presetService}`;
    setServiceIds([presetService]);
    setStartAt("");
    setDraft({ salonId: salon.id, slug: salon.slug, salonName: salon.name, serviceIds: [presetService] });
  }, [presetService, salon, slug, setDraft]);

  /* ── بارگذاری سالن، آرایشگران و نظرات ───────────────────────────── */
  useEffect(() => {
    if (!configReady || !slug) return;
    let alive = true;
    setLoading(true);
    setLoadError("");
    void (async () => {
      const detail = await mapi<{ success: boolean; error?: string; salon?: MiniSalonDetail }>(`/api/salons/${slug}`);
      if (!alive) return;
      if (!detail.ok || !detail.data.salon) {
        setLoadError(detail.data?.error || "این سالن در دسترس نیست.");
        setLoading(false);
        return;
      }
      setSalon(detail.data.salon);
      setStaff([]);
      setReviews([]);

      const [staffRes, reviewsRes] = await Promise.all([
        mapi<{ success: boolean; staff?: MiniStaff[] }>(`/api/mini/staff?slug=${encodeURIComponent(slug)}`),
        config.features.reviews
          ? mapi<{ success: boolean; reviews?: MiniReview[] }>(`/api/salons/${slug}/reviews?limit=6`)
          : Promise.resolve(null),
      ]);
      if (!alive) return;
      if (staffRes.ok && Array.isArray(staffRes.data?.staff)) setStaff(staffRes.data.staff);
      if (reviewsRes && reviewsRes.ok && Array.isArray(reviewsRes.data?.reviews)) setReviews(reviewsRes.data.reviews);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [slug, configReady, config.features.reviews]);

  /* ── خالی‌سازی انتخاب‌ها وقتی از سالن دیگری می‌آییم ─────────────── */
  useEffect(() => {
    if (draft.slug && draft.slug !== slug) {
      setServiceIds([]);
      setStaffId("");
      setDay("");
      setStartAt("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const pickedServices = useMemo<MiniService[]>(
    () => (salon?.services ?? []).filter((s) => serviceIds.includes(s.id)),
    [salon, serviceIds]
  );
  const shownStaff = useMemo(() => eligibleStaff(staff, serviceIds), [staff, serviceIds]);
  const staffStillValid = staffId === "" || shownStaff.some((s) => s.id === staffId);

  /* ── زمان‌های خالی ──────────────────────────────────────────────── */
  const loadSlots = useCallback(async () => {
    if (!slug || !serviceIds.length || !day) {
      setAvailability(null);
      return;
    }
    setSlotsLoading(true);
    const params = new URLSearchParams({ date: day, serviceIds: serviceIds.join(",") });
    if (staffStillValid && staffId) params.set("employeeId", staffId);
    const res = await mapi<AvailabilityResponse>(`/api/salons/${slug}/availability?${params.toString()}`);
    if (!res.ok) {
      setAvailability(null);
      toast(res.data?.error || "محاسبهٔ ساعت‌های خالی ممکن نشد", "error");
    } else {
      setAvailability(res.data);
    }
    setSlotsLoading(false);
  }, [slug, serviceIds, day, staffId, staffStillValid, toast]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  /* اگر ساعت انتخابی در فهرست جدید نیست، حذفش می‌کنیم */
  useEffect(() => {
    if (!startAt) return;
    if (availability && !availability.slots.some((s) => s.startAt === startAt)) setStartAt("");
  }, [availability, startAt]);

  const totals = availability?.totals ?? {
    durationMin: pickedServices.reduce((a, s) => a + s.durationMin, 0),
    bufferMin: 0,
    price: pickedServices.reduce((a, s) => a + s.price, 0),
  };

  const canBook = Boolean(salon && serviceIds.length && day && startAt && config.features.booking);

  /* ── نزدیک‌ترین وقت خالی: روزهای پیش‌رو را یکی‌یکی می‌پرسد ─────────── */
  async function findNearestSlot() {
    if (!salon || !serviceIds.length) {
      toast("اول یک خدمت انتخاب کنید", "error");
      return;
    }
    setFinding(true);
    const startIndex = Math.max(0, days.indexOf(day || days[0]));
    for (let i = startIndex; i < days.length; i++) {
      const params = new URLSearchParams({ date: days[i], serviceIds: serviceIds.join(",") });
      if (staffStillValid && staffId) params.set("employeeId", staffId);
      const res = await mapi<AvailabilityResponse>(`/api/salons/${encodeURIComponent(salon.slug)}/availability?${params.toString()}`);
      const slot = res.ok ? res.data?.slots?.[0] : undefined;
      if (slot) {
        const tz = res.data?.timezone || timezone;
        setDay(days[i]);
        setStartAt(slot.startAt);
        setDraft({
          date: days[i],
          startAt: slot.startAt,
          timezone: tz,
          salonId: salon.id,
          slug: salon.slug,
          salonName: salon.name,
          serviceIds,
          price: res.data?.totals?.price ?? totals.price,
          durationMin: res.data?.totals?.durationMin ?? totals.durationMin,
        });
        haptic("success");
        toast(`نزدیک‌ترین وقت خالی: ${dayLabel(days[i], tz)} — ${timeLabel(slot.startAt, tz)}`, "ok");
        setFinding(false);
        return;
      }
    }
    setFinding(false);
    toast("در این بازه وقت خالی‌ای نیست؛ در لیست انتظار ثبت شوید", "info");
    setWaitOpen(true);
  }

  const dayIsFull = Boolean(day && serviceIds.length && !slotsLoading && availability && availability.slots.length === 0);

  function openSheet() {
    if (!config.features.booking) {
      toast("رزرو آنلاین برای این پیام‌رسان غیرفعال است", "error");
      return;
    }
    if (!serviceIds.length) {
      toast("اول حداقل یک خدمت انتخاب کنید", "error");
      return;
    }
    if (!day || !startAt) {
      toast("روز و ساعت را انتخاب کنید", "error");
      return;
    }
    if (config.features.requireLogin && !me) {
      setLoginOpen(true);
      return;
    }
    setName((prev) => prev || me?.name || profile.name);
    setPhone((prev) => prev || me?.phone || profile.phone);
    setSheetOpen(true);
  }

  async function submit() {
    if (!salon) return;
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    if (cleanName.length < 2) {
      toast("نام را کامل بنویسید", "error");
      return;
    }
    if (!isPhone(cleanPhone)) {
      toast("شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)", "error");
      return;
    }
    setSubmitting(true);
    const res = await mapi<{ success: boolean; error?: string; appointment?: { id: string; startAt: string } }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        salonId: salon.id,
        serviceIds,
        employeeId: staffStillValid && staffId ? staffId : undefined,
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
    setSheetOpen(false);
    resetDraft();
  }

  if (loading) {
    return (
      <div className="mini-fade">
        <SkeletonList count={2} />
        <div style={{ marginTop: 12 }}>
          <SkeletonList count={3} />
        </div>
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="mini-fade">
        <EmptyState text={loadError || "سالن یافت نشد."} hint="شاید این سالن غیرفعال شده باشد." />
        <Button variant="ghost" onClick={() => navigate("/mini")}>
          بازگشت به خانه
        </Button>
      </div>
    );
  }

  return (
    <div className="mini-fade">
      {/* معرفی سالن */}
      <div className="mini-card">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="mini-salon-cover" style={{ width: 54, height: 54, flex: "0 0 54px" }}>
            {salon.logoUrl || salon.bannerUrl ? <img src={salon.logoUrl || salon.bannerUrl || ""} alt="" /> : salon.name.slice(0, 1)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="mini-salon-name">{salon.name}</div>
            <div className="mini-salon-meta">{[salon.city, salon.address].filter(Boolean).join(" · ") || "—"}</div>
          </div>
        </div>
        {salon.description ? <p className="mini-option-sub" style={{ marginTop: 10, lineHeight: 1.9 }}>{salon.description}</p> : null}
        <div className="mini-row" style={{ marginTop: 6 }}>
          <span>تعداد خدمات</span>
          <span>{faDigits(salon.services.length)}</span>
        </div>
        {reviews.length ? (
          <div className="mini-row">
            <span>میانگین نظر</span>
            <span>
              <span className="mini-rate">
                <StarIcon /> {ratingText(Number((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1)), reviews.length)}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      {/* خدمات */}
      <SectionTitle title="خدمت مورد نظر" hint="یکی یا چند مورد" />
      {salon.services.length === 0 ? (
        <div className="mini-note">این سالن هنوز خدمتی تعریف نکرده است؛ برای نوبت سرخود با سالن تماس بگیرید.</div>
      ) : (
        <ServicePicker
          services={salon.services}
          selected={serviceIds}
          showPrices={showPrices}
          onToggle={(id) => {
            const next = serviceIds.includes(id) ? serviceIds.filter((x) => x !== id) : [...serviceIds, id];
            setServiceIds(next);
            setStartAt("");
            setDraft({ salonId: salon.id, slug: salon.slug, salonName: salon.name, serviceIds: next });
          }}
        />
      )}

      {/* آرایشگر */}
      {staff.length ? (
        <>
          <SectionTitle title="آرایشگر" hint="اختیاری" />
          <StaffPicker
            staff={shownStaff}
            value={staffStillValid ? staffId : ""}
            onChange={(id) => {
              setStaffId(id);
              setStartAt("");
              setDraft({ staffId: id, staffName: shownStaff.find((s) => s.id === id)?.name ?? "" });
            }}
          />
        </>
      ) : null}

      {/* روز و ساعت */}
      {config.features.booking ? (
        <>
          <SectionTitle title="روز" hint={`${faDigits(DAYS_SHOWN)} روز پیش‌رو`} />
          <DayStrip
            days={days}
            value={day || days[0]}
            timezone={timezone}
            onChange={(d) => {
              setDay(d);
              setStartAt("");
              setDraft({ date: d, timezone });
            }}
          />

          <SectionTitle title="ساعت" hint={day ? "" : "یک روز انتخاب کنید"} />
          <SlotGrid
            slots={availability?.slots ?? []}
            value={startAt}
            timezone={timezone}
            loading={slotsLoading}
            emptyText={day && serviceIds.length ? "در این روز وقت خالی نیست؛ راه‌های سریع‌تر را پایین ببینید." : "برای دیدن ساعت‌های خالی، خدمت و روز را انتخاب کنید."}
            onSelect={(iso) => {
              setStartAt(iso);
              haptic("light");
              setDraft({ startAt: iso, price: totals.price, durationMin: totals.durationMin });
            }}
          />

          {/* روز پر است؟ دو کار سریع به‌جای گشتن بین روزها */}
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
            slug={slug}
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
        <div className="mini-note" style={{ marginTop: 14 }}>رزرو آنلاین در تنظیمات پنل غیرفعال شده است. برای نوبت با سالن تماس بگیرید.</div>
      )}

      {/* خلاصه + دکمهٔ رزرو */}
      {config.features.booking && serviceIds.length ? (
        <>
          <SectionTitle title="خلاصهٔ نوبت" />
          <BookingSummary
            services={pickedServices.map((s) => s.name)}
            price={totals.price}
            minutes={totals.durationMin}
            when={startAt}
            staffName={shownStaff.find((s) => s.id === staffId)?.name ?? ""}
            showPrices={showPrices}
          />
        </>
      ) : null}

      <div style={{ height: 96 }} />
      {config.features.booking ? (
        <div className="mini-sticky-cta">
          <div>
            <Button onClick={openSheet} disabled={!canBook}>
              <Icon name="calendar" size={18} />
              {startAt
                ? `رزرو · ${showPrices ? toman(totals.price) : "تأیید ساعت"}`
                : !serviceIds.length
                  ? "یک خدمت را انتخاب کنید"
                  : !day
                    ? "یک روز را انتخاب کنید"
                    : "یک ساعت خالی را انتخاب کنید"}
            </Button>
          </div>
        </div>
      ) : salon.phone ? (
        <div className="mini-sticky-cta">
          <div>
            <a className="mini-btn" href={`tel:${salon.phone}`} style={{ textDecoration: "none" }}>
              <Icon name="phone" size={18} />
              تماس با سالن
            </a>
          </div>
        </div>
      ) : null}

      {/* نظرات */}
      {config.features.reviews && reviews.length ? (
        <>
          <SectionTitle title="نظر مشتریان" hint={`${faDigits(reviews.length)} نظر`} />
          {reviews.map((r) => (
            <div key={r.id} className="mini-card" style={{ padding: 12 }}>
              <div className="mini-appt-head">
                <b style={{ fontSize: 13 }}>{r.customerName}</b>
                <span className="mini-stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} style={{ opacity: i < r.rating ? 1 : 0.25 }}>
                      <StarIcon size={12} />
                    </span>
                  ))}
                </span>
              </div>
              {r.comment ? <p className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>{r.comment}</p> : null}
              {r.staff ? <div className="mini-option-sub" style={{ marginTop: 4 }}>آرایشگر: {r.staff}</div> : null}
            </div>
          ))}
        </>
      ) : null}

      {/* شیت اطلاعات تماس */}
      <Sheet open={sheetOpen} title="تکمیل نوبت" onClose={() => setSheetOpen(false)}>
        <Field label="نام و نام خانوادگی" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً مریم رضایی" />
        <Field label="شماره موبایل" name="phone" dir="ltr" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" />
        <Field label="توضیح اختیاری" name="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً زنگ بزنید" />
        <div className="mini-card" style={{ padding: 10, marginBottom: 12 }}>
          <Row label="سالن" value={salon.name} />
          <Row label="خدمات" value={pickedServices.map((s) => s.name).join("، ")} />
          {showPrices ? <Row label="قیمت تقریبی" value={toman(totals.price)} /> : null}
          <Row label="مدت" value={`${faDigits(totals.durationMin)} دقیقه`} />
        </div>
        <Button onClick={submit} loading={submitting}>
          ثبت نوبت
        </Button>
        <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center" }}>
          بعد از ثبت، پیامک تأیید برای شما ارسال می‌شود.
        </div>
      </Sheet>

      {/* شیت موفقیت */}
      <Sheet open={Boolean(done)} title="نوبت شما ثبت شد" onClose={() => setDone(null)}>
        {done ? (
          <>
            <div className="mini-note" style={{ marginBottom: 12 }}>
              کد پیگیری: <b>{done.id.slice(0, 8)}</b>
            </div>
            <Row label="سالن" value={salon.name} />
            <div className="mini-btn-row" style={{ marginTop: 14 }}>
              <Button variant="ghost" onClick={() => closeMiniApp()}>
                بستن
              </Button>
              <Button
                onClick={() => {
                  setDone(null);
                  navigate("/mini/appointments");
                }}
              >
                نوبت‌های من
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>

      <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} reason="برای رزرو نوبت در این پیام‌رسان باید وارد شوید." />
    </div>
  );
}
