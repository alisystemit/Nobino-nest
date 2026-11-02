/**
 * کارهایی که کاربر روی یک نوبت می‌تواند بکند — در خانه («نوبت بعدی من») و در
 * «نوبت‌های من» استفاده می‌شود تا یک بار نوشته شود و همه‌جا یکسان بماند.
 * همه از endpoint های موجود سایت می‌آیند:
 *   تغییر وقت → POST /api/appointments/:id/reschedule (تداخل ساعت را سرور دوباره چک می‌کند)
 *   لغو       → POST /api/appointments/:id/cancel
 *   نظر       → POST /api/salons/:slug/reviews  (فقط برای نوبت انجام‌شده)
 * ساعت‌های خالی برای تغییر وقت از /api/salons/:slug/availability می‌آید.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DayStrip, SlotGrid, upcomingDays } from "./booking";
import { Area, Button, Field, Icon, Sheet, Stars } from "./ui";
import { haptic } from "../lib/bridge";
import { faDigits, fullLabel, timeLabel, toman, ymd } from "../lib/format";
import { mapi, useMini } from "../lib/store";
import type { AvailabilityResponse, MiniAppointment } from "../lib/types";

const RESCHEDULE_DAYS = 10;

/** ردیف دکمه‌های یک نوبت */
export function AppointmentActions({
  appt,
  onChangeTime,
  onCancel,
  onReview,
}: {
  appt: MiniAppointment;
  onChangeTime: () => void;
  onCancel: () => void;
  onReview: () => void;
}) {
  const { config } = useMini();
  const isPast = new Date(appt.endAt).getTime() < Date.now();
  const canMove = !isPast && (appt.status === "REQUESTED" || appt.status === "CONFIRMED");
  const canCancel = !isPast && appt.status !== "CANCELLED";
  const canReview = config.features.reviews && appt.status === "COMPLETED";

  if (!canMove && !canCancel && !canReview) return null;

  return (
    <div className="mini-actions">
      {canMove ? (
        <button type="button" className="mini-btn tiny" onClick={onChangeTime}>
          <Icon name="clock" size={15} />
          تغییر وقت
        </button>
      ) : null}
      {canReview ? (
        <button type="button" className="mini-btn soft tiny" onClick={onReview}>
          <Icon name="star" size={15} />
          ثبت نظر
        </button>
      ) : null}
      {canCancel ? (
        <button type="button" className="mini-btn ghost tiny" onClick={onCancel}>
          لغو
        </button>
      ) : null}
    </div>
  );
}

/* ── تغییر وقت ─────────────────────────────────────────────────────── */

export function RescheduleSheet({
  appt,
  onClose,
  onDone,
}: {
  appt: MiniAppointment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useMini();
  const slug = appt?.salonSlug ?? "";
  const timezone = appt?.salonTimezone ?? "Asia/Tehran";
  const days = useMemo(() => upcomingDays(RESCHEDULE_DAYS, timezone), [timezone]);

  const [day, setDay] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!appt) return;
    /** روز نوبت اگر در نوار روزها هست انتخاب شود؛ وگرنه اولین روز.
     *  روز خالیِ پیش‌انتخاب کاربر را مجبور می‌کرد اول یک روز بزند و ساعت‌ها را نمی‌دید. */
    const own = appt.startAt ? ymd(new Date(appt.startAt), timezone) : "";
    setDay(days.includes(own) ? own : days[0] || "");
    setPicked("");
    setAvailability(null);
  }, [appt?.id, appt?.salonSlug, days, timezone]);

  const loadSlots = useCallback(async () => {
    if (!slug || !day || !appt?.serviceId) {
      setAvailability(null);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ date: day, serviceIds: appt.serviceId });
    if (appt.employeeId) params.set("employeeId", appt.employeeId);
    const res = await mapi<AvailabilityResponse>(`/api/salons/${slug}/availability?${params.toString()}`);
    setAvailability(res.ok ? res.data : null);
    setLoading(false);
    if (!res.ok) toast(res.data?.error || "ساعت‌های خالی محاسبه نشد", "error");
  }, [slug, day, appt?.serviceId, appt?.employeeId, toast]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function save() {
    if (!appt || !picked) return;
    setSaving(true);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/appointments/${appt.id}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ startAt: picked }),
    });
    setSaving(false);
    if (!res.ok) {
      toast(res.data?.error || "تغییر وقت ممکن نشد؛ سالن را در تماس خبر کنید", "error");
      return;
    }
    haptic("success");
    toast("وقت نوبت عوض شد", "ok");
    onDone();
    onClose();
  }

  const noService = Boolean(appt && !appt.serviceId);

  return (
    <Sheet open={Boolean(appt)} title="تغییر وقت نوبت" onClose={onClose}>
      {appt ? (
        <>
          <div className="mini-note" style={{ marginBottom: 12 }}>
            {appt.salonName} — {fullLabel(appt.startAt, timezone)}
            {appt.service ? ` · ${appt.service}` : ""}
          </div>

          {noService ? (
            <div className="mini-note">
              برای این نوبت خدمتی ثبت نشده، پس ساعت خالی را نمی‌توانیم حساب کنیم. با سالن تماس بگیرید تا وقت را عوض کند.
            </div>
          ) : (
            <>
              <DayStrip days={days} value={day || days[0]} timezone={timezone} onChange={(d) => { setDay(d); setPicked(""); }} />
              <div style={{ height: 12 }} />
              <SlotGrid
                slots={availability?.slots ?? []}
                value={picked}
                timezone={timezone}
                loading={loading}
                emptyText={day ? "این روز پر است؛ یک روز دیگر را امتحان کنید." : "یک روز را انتخاب کنید."}
                onSelect={(iso) => { setPicked(iso); haptic("light"); }}
              />
            </>
          )}

          <div className="mini-btn-row" style={{ marginTop: 14 }}>
            <Button variant="ghost" onClick={onClose}>
              بی‌خیال
            </Button>
            <Button onClick={save} loading={saving} disabled={!picked}>
              {picked ? `ثبت ساعت ${timeLabel(picked, timezone)}` : "یک ساعت را انتخاب کنید"}
            </Button>
          </div>
          <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center", lineHeight: 1.9 }}>
            اگر ساعت انتخابی با نوبت دیگری تداخل داشته باشد، سالن پیامک تغییر وقت را دریافت می‌کند و ما به شما می‌گوییم.
          </div>
        </>
      ) : null}
    </Sheet>
  );
}

/* ── لغو نوبت ──────────────────────────────────────────────────────── */

export function CancelSheet({
  appt,
  onClose,
  onDone,
}: {
  appt: MiniAppointment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useMini();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (appt) setReason("");
  }, [appt?.id]);

  async function save() {
    if (!appt) return;
    setBusy(true);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/appointments/${appt.id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      toast(res.data?.error || "لغو ممکن نشد", "error");
      return;
    }
    toast("نوبت لغو شد", "ok");
    onDone();
    onClose();
  }

  return (
    <Sheet open={Boolean(appt)} title="لغو نوبت" onClose={onClose}>
      {appt ? (
        <>
          <div className="mini-note" style={{ marginBottom: 12 }}>
            «{appt.salonName}» — {fullLabel(appt.startAt, appt.salonTimezone ?? undefined)}
          </div>
          <Field label="دلیل لغو (اختیاری)" name="cancel_reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً تغییر برنامه" />
          <Button className="danger" variant="ghost" onClick={save} loading={busy}>
            بله، لغو کن
          </Button>
          <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center", lineHeight: 1.9 }}>
            با لغو، این ساعت آزاد می‌شود. برای رزرو دوباره به صفحهٔ سالن بروید.
          </div>
        </>
      ) : null}
    </Sheet>
  );
}

/* ── ثبت نظر ───────────────────────────────────────────────────────── */

export function ReviewSheet({
  appt,
  onClose,
  onDone,
}: {
  appt: MiniAppointment | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useMini();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (appt) {
      setRating(5);
      setComment("");
    }
  }, [appt?.id]);

  async function save() {
    if (!appt?.salonSlug) return;
    setBusy(true);
    const res = await mapi<{ success: boolean; error?: string }>(`/api/salons/${appt.salonSlug}/reviews`, {
      method: "POST",
      body: JSON.stringify({
        rating,
        comment: comment.trim() || undefined,
        appointmentId: appt.id,
        staffId: appt.employeeId || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const code = res.status;
      toast(code === 409 ? "برای این نوبت قبلاً نظر ثبت کرده‌اید" : res.data?.error || "ثبت نظر ممکن نشد", "error");
      if (code === 409) {
        onDone();
        onClose();
      }
      return;
    }
    haptic("success");
    toast("نظر شما ثبت شد. ممنون!", "ok");
    onDone();
    onClose();
  }

  return (
    <Sheet open={Boolean(appt)} title="نظر شما دربارهٔ این نوبت" onClose={onClose}>
      {appt ? (
        <>
          <div className="mini-option-sub" style={{ textAlign: "center", marginBottom: 4 }}>
            {appt.salonName}
            {appt.service ? ` · ${appt.service}` : ""}
            {appt.employee ? ` · ${appt.employee}` : ""}
          </div>
          <Stars value={rating} onChange={setRating} />
          <div className="mini-option-sub" style={{ textAlign: "center", marginBottom: 12 }}>
            {["خیلی بد", "بد", "معمولی", "خوب", "عالی"][rating - 1]}
          </div>
          <Area label="توضیح (اختیاری)" name="review_comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="مثلاً رنگ مو دقیقاً همان چیزی بود که خواستم" />
          <Button onClick={save} loading={busy}>
            ثبت نظر
          </Button>
        </>
      ) : null}
    </Sheet>
  );
}

/* ── کارت خلاصهٔ یک نوبت (خانه و فهرست‌ها) ─────────────────────────── */

export function AppointmentLine({ appt, showPrice = true }: { appt: MiniAppointment; showPrice?: boolean }) {
  return (
    <>
      <div className="mini-item-title">
        {appt.service ?? "نوبت"} {appt.employee ? `· ${appt.employee}` : ""}
      </div>
      <div className="mini-item-sub">
        {appt.salonName ?? "سالن"} · {fullLabel(appt.startAt, appt.salonTimezone ?? undefined)}
        {appt.note ? ` · یادداشت: ${appt.note}` : ""}
      </div>
      {showPrice && appt.servicePrice ? <span className="mini-item-side">{toman(appt.servicePrice)}</span> : null}
    </>
  );
}

/** «۲ روز و ۳ ساعت مانده» — برای کارت نوبت بعدی */
export function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "الان";
  const totalHours = Math.floor(ms / 3_600_000);
  if (totalHours < 1) return `${faDigits(Math.max(1, Math.floor(ms / 60_000)))} دقیقه مانده`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days && hours) return `${faDigits(days)} روز و ${faDigits(hours)} ساعت مانده`;
  if (days) return `${faDigits(days)} روز مانده`;
  return `${faDigits(hours)} ساعت مانده`;
}
