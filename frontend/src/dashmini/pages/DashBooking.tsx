/**
 * رزرو دستی — نسخهٔ مینی‌استایلِ /dashboard/new-appointment.
 * دقیقاً همان POST /api/appointments و همان اعتبارسنجی سمت سرور (تداخل زمانی و
 * سقف رزرو در سرویس‌لایر قفل می‌شود)؛ فقط فرم به واژگان ظاهری مینی‌اپ درآمده و
 * ساعت‌های آزاد از همان مسیر عمومی availability سالن خوانده می‌شوند.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Field, Icon, SectionTitle, SkeletonList } from "@/mini/components/ui";
import { DayStrip, ServicePicker, SlotGrid, StaffPicker, eligibleStaff, upcomingDays } from "@/mini/components/booking";
import { compactToman, duration, faDigits, relativeDayLabel, timeLabel, weekdayLabel, ymd } from "@/mini/lib/format";
import type { MiniService, MiniSlot, MiniStaff } from "@/mini/lib/types";
import { zonedTimeToIso } from "@/lib/time/zoned";
import { dapi } from "../lib/api";
import { SalonSwitcher } from "../lib/parts";
import { useDash } from "../lib/store";

type Branch = { id: string; name: string };

/** پرس‌وجوی ساعت‌های آزاد همان مسیر عمومی صفحهٔ سالن است (کش‌شونده با انتخاب‌ها) */
export default function DashBooking() {
  const { salon, salonId, toast } = useDash();
  const navigate = useNavigate();

  const tz: string = salon?.timezone || "Asia/Tehran";
  const slug: string = salon?.slug || "";

  const [services, setServices] = useState<MiniService[]>([]);
  const [staff, setStaff] = useState<MiniStaff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [listLoading, setListLoading] = useState(true);

  const [serviceId, setServiceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [day, setDay] = useState(() => ymd(new Date(), tz));
  const [slot, setSlot] = useState("");
  const [customTime, setCustomTime] = useState("");

  const [slots, setSlots] = useState<MiniSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  /* بارگذاری خدمات / کارکنان / شعبه‌ها — همان سه مسیر پنل وب */
  useEffect(() => {
    if (!salonId) {
      setListLoading(false);
      return;
    }
    let alive = true;
    setListLoading(true);
    (async () => {
      const [s, st, b] = await Promise.all([
        dapi<{ success: boolean; services?: MiniService[] }>(`/api/dashboard/salons/${salonId}/services`),
        dapi<{ success: boolean; staff?: any[] }>(`/api/dashboard/salons/${salonId}/staff`),
        dapi<{ success: boolean; branches?: Branch[] }>(`/api/dashboard/salons/${salonId}/branches`),
      ]);
      if (!alive) return;
      if (s.ok && s.data.services) setServices(s.data.services);
      if (st.ok && st.data.staff) {
        setStaff(
          st.data.staff.map((x: any) => ({
            id: x.id,
            name: x.name,
            title: x.title ?? "",
            avatarUrl: x.avatarUrl ?? "",
            specialties: x.specialties ?? [],
            bio: x.bio ?? "",
            branchId: x.branchId ?? "",
            serviceIds: (x.services ?? []).map((sv: any) => sv.id),
            rating: x.rating ?? null,
            reviewCount: x.reviewCount ?? 0,
          }))
        );
      }
      if (b.ok && b.data.branches) setBranches(b.data.branches);
      setListLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [salonId]);

  /* روز پیش‌فرض را با رسیدن ساعت سالن هم‌راستا می‌کنیم */
  useEffect(() => {
    setDay((d) => (d && d !== ymd(new Date(), "UTC") ? d : ymd(new Date(), tz)));
  }, [tz]);

  const chosenService = useMemo(() => services.find((s) => s.id === serviceId) || null, [services, serviceId]);
  const pool = useMemo(() => eligibleStaff(staff, serviceId ? [serviceId] : []), [staff, serviceId]);

  /* ساعت‌های آزاد — با هر تغییر انتخاب‌ها دوباره پرس‌وجو می‌شود */
  const loadSlots = useCallback(async () => {
    if (!slug || !serviceId || !day) {
      setSlots([]);
      setSlotsError("");
      return;
    }
    setSlotsLoading(true);
    setSlotsError("");
    const q = new URLSearchParams({ date: day, serviceIds: serviceId });
    if (employeeId) q.set("employeeId", employeeId);
    if (branchId) q.set("branchId", branchId);
    const res = await dapi<{ success: boolean; error?: string; slots?: MiniSlot[] }>(
      `/api/salons/${encodeURIComponent(slug)}/availability?${q.toString()}`
    );
    if (res.ok && res.data.slots) setSlots(res.data.slots);
    else {
      setSlots([]);
      setSlotsError(res.data?.error || "ساعت‌های آزاد این روز حساب نشد.");
    }
    setSlotsLoading(false);
  }, [slug, serviceId, day, employeeId, branchId]);

  useEffect(() => {
    setSlot("");
    void loadSlots();
  }, [loadSlots]);

  const days = useMemo(() => upcomingDays(14, tz), [tz]);
  const timeText = customTime.trim() || (slot ? timeLabel(slot, tz) : "");

  async function submit() {
    if (!salonId) return;
    if (!name.trim() || !phone.trim() || !day || !timeText) {
      setResult({ ok: false, text: "نام، شماره موبایل، تاریخ و ساعت لازم است." });
      return;
    }
    const startAt = slot && !customTime.trim() ? slot : zonedTimeToIso(day, timeText, tz);
    setSaving(true);
    setResult(null);
    const res = await dapi<{ success: boolean; error?: string }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        salonId,
        serviceId: serviceId || undefined,
        employeeId: employeeId || undefined,
        branchId: branchId || undefined,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        startAt,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setResult({ ok: false, text: res.data?.error || "ثبت نوبت ممکن نشد." });
      return;
    }
    setResult({
      ok: true,
      text: `نوبت ${name.trim()} برای ${weekdayLabel(day, tz)} ساعت ${timeText} ثبت شد.`,
    });
    setName("");
    setPhone("");
    setSlot("");
    setCustomTime("");
    void loadSlots();
    toast("نوبت ثبت شد", "ok");
  }

  if (!salonId) {
    return (
      <div className="mini-fade">
        <SectionTitle title="ثبت دستی نوبت" hint="ابتدا یک سالن انتخاب کنید." />
        <SalonSwitcher />
        <div style={{ marginTop: 12 }}>
          <EmptyState text="سالنی برای این کاربر ثبت نشده است." hint="از «سالن من» می‌توانید سالن بسازید." />
        </div>
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="ثبت دستی نوبت" hint="مشتری تلفنی یا حضوری — بدون صوت و هوش مصنوعی" />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          <button type="button" className="mini-btn soft tiny" onClick={() => navigate("/dash/voice-booking")}>
            <Icon name="mic" size={15} />
            رزرو صوتی
          </button>
          <SalonSwitcher />
        </div>
      </div>

      {listLoading ? (
        <div style={{ marginTop: 12 }}>
          <SkeletonList count={3} />
        </div>
      ) : (
        <>
          <div className="mini-card" style={{ marginTop: 12 }}>
            <div className="mini-appt-head">
              <b>مشتری</b>
              <span className="mini-option-sub">نام و موبایل برای کارت مشتری لازم است</span>
            </div>
            <div className="dash-two" style={{ marginTop: 10 }}>
              <Field label="نام مشتری" name="bkName" placeholder="مثلاً سارا احمدی" value={name} onChange={(e) => setName(e.target.value)} />
              <Field
                label="شماره موبایل"
                name="bkPhone"
                type="tel"
                dir="ltr"
                className="is-ltr"
                placeholder="09123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="mini-card" style={{ marginTop: 12 }}>
            <div className="mini-appt-head">
              <b>خدمت</b>
              {chosenService ? (
                <span className="mini-option-sub">
                  {duration(chosenService.durationMin)} · {compactToman(chosenService.price)}
                </span>
              ) : (
                <span className="mini-option-sub">انتخاب دلخواه است</span>
              )}
            </div>
            {services.length === 0 ? (
              <div className="mini-note" style={{ marginTop: 10 }}>
                هنوز خدمتی تعریف نشده است. از بخش «خدمات و پکیج» اضافه کنید.
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <ServicePicker
                  services={services}
                  selected={serviceId ? [serviceId] : []}
                  showPrices
                  onToggle={(id) => {
                    setServiceId((cur) => (cur === id ? "" : id));
                    setEmployeeId("");
                  }}
                />
              </div>
            )}
          </div>

          {pool.length > 0 ? (
            <div className="mini-card" style={{ marginTop: 12 }}>
              <div className="mini-appt-head">
                <b>آرایشگر و شعبه</b>
                <span className="mini-option-sub">{faDigits(pool.length)} نفر با این انتخاب</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <StaffPicker staff={pool} value={employeeId} onChange={setEmployeeId} />
              </div>
              {branches.length > 1 ? (
                <div className="mini-chips" style={{ marginTop: 12 }}>
                  <button type="button" className={`mini-chip${branchId === "" ? " is-on" : ""}`} onClick={() => setBranchId("")}>
                    شعبهٔ اصلی
                  </button>
                  {branches.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={`mini-chip${branchId === b.id ? " is-on" : ""}`}
                      onClick={() => setBranchId(b.id)}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mini-card" style={{ marginTop: 12 }}>
            <div className="mini-appt-head">
              <b>روز و ساعت</b>
              <span className="mini-option-sub">{day ? `${relativeDayLabel(day, tz)} · ${weekdayLabel(day, tz)}` : ""}</span>
            </div>
            <div style={{ marginTop: 10 }}>
              <DayStrip
                days={days}
                value={day}
                timezone={tz}
                onChange={(d) => {
                  setDay(d);
                  setSlot("");
                  setCustomTime("");
                }}
              />
            </div>

            {serviceId ? (
              <div style={{ marginTop: 12 }}>
                {slotsLoading ? (
                  <SkeletonList count={2} />
                ) : slotsError ? (
                  <div className="mini-note">{slotsError}</div>
                ) : (
                  <SlotGrid slots={slots} value={slot} timezone={tz} onSelect={(iso) => { setSlot(iso); setCustomTime(""); }} />
                )}
              </div>
            ) : (
              <div className="mini-note" style={{ marginTop: 12 }}>
                برای دیدن ساعت‌های آزاد، یک خدمت انتخاب کنید.
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <Field
                label="ساعت دلخواه (اختیاری)"
                name="bkTime"
                type="time"
                dir="ltr"
                className="is-ltr"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                hint="اگر ساعت آزاد در فهرست نبود، همین‌جا تایپ کنید؛ تداخل زمانی را سرور بررسی می‌کند."
              />
            </div>
          </div>

          {result ? (
            <div className={`mini-note${result.ok ? " dash-note-ok" : " dash-note-bad"}`} style={{ marginTop: 12 }}>
              {result.ok ? "✓ " : "! "}
              {result.text}
              {result.ok ? (
                <button type="button" className="mini-btn ghost tiny" style={{ marginInlineStart: 8 }} onClick={() => navigate("/dash/appointments")}>
                  دیدن در نوبت‌ها
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="dash-section-note">
            تداخل زمانی و سقف رزرو در سرور بررسی می‌شود؛ اگر ساعت پر باشد، خطای دقیق همین‌جا می‌آید. برای ثبت با گفتار مشتری، «رزرو صوتی» را
            استفاده کنید.
          </div>

          <div className="dash-sticky">
            <Button variant="primary" loading={saving} disabled={saving} onClick={submit} className="dash-grow">
              <Icon name="calendar" size={17} />
              {saving ? "در حال ثبت…" : "ثبت نوبت"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
