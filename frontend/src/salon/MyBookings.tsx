/**
 * «نوبت من در این سالن» — برای بازدیدکنندهٔ واردشده.
 * از همان `GET /api/appointments` سایت می‌خواند و کارهای روی نوبت
 * (تغییر وقت، لغو، ثبت نظر) را به اجزای مشترک مینی‌اپ می‌سپارد؛
 * فایلی در frontend/src/mini ویرایش نشده و فقط import می‌شود.
 */
import { useCallback, useEffect, useState } from "react";
import { AppointmentActions, CancelSheet, RescheduleSheet, ReviewSheet, countdown } from "@/mini/components/appt-actions";
import { Icon, SectionTitle, StatusBadge } from "@/mini/components/ui";
import { faDigits, faText, fromNow, fullLabel, toman } from "@/mini/lib/format";
import { mapi, useMini } from "@/mini/lib/store";
import type { MiniAppointment } from "@/mini/lib/types";
import { siteHref } from "./site-url";

export default function MyBookings({ salonId, salonName, nonce }: { salonId: string; salonName: string; nonce: number }) {
  const { me } = useMini();
  const [items, setItems] = useState<MiniAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MiniAppointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MiniAppointment | null>(null);
  const [reviewTarget, setReviewTarget] = useState<MiniAppointment | null>(null);

  const load = useCallback(async () => {
    if (!me) {
      setItems([]);
      return;
    }
    setLoading(true);
    const res = await mapi<{ success: boolean; appointments?: MiniAppointment[] }>("/api/appointments?limit=30");
    const rows = Array.isArray(res.data?.appointments) ? res.data.appointments : [];
    // فقط نوبت‌های همین سالن و متعلق به همین مشتری
    const mine = (a: MiniAppointment) => !me.phone || !a.customerPhone || a.customerPhone === me.phone;
    setItems(rows.filter((a) => a.salonId === salonId && mine(a)));
    setLoading(false);
  }, [me, salonId]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  if (!me) return null;

  const now = Date.now();
  const upcoming = items
    .filter((a) => new Date(a.startAt).getTime() >= now && a.status !== "CANCELLED")
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  // نزدیک‌ترین نوبت تمام‌شده‌ای که هنوز نظری ندارد، برای «ثبت نظر»
  const recentDone = items
    .filter((a) => a.status === "COMPLETED" && new Date(a.startAt).getTime() < now)
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())[0];
  const reviewable = !upcoming.length ? recentDone : null;
  const shown = upcoming[0] ?? reviewable ?? null;

  if (loading && !shown) return <div className="mini-skeleton" style={{ height: 86, marginBottom: 12 }} />;
  if (!shown) return null;

  return (
    <>
      <SectionTitle
        title={upcoming.length ? "نوبت بعدی شما" : "آخرین نوبت شما"}
        hint={upcoming.length > 1 ? `${faDigits(upcoming.length)} نوبت پیش‌رو` : undefined}
        action={
          <a className="mini-more" href={siteHref("/dashboard/appointments")} style={{ textDecoration: "none" }}>
            همهٔ نوبت‌ها
          </a>
        }
      />
      <div className="mini-next">
        <div className="mini-next-head">
          <span className="mini-hero-cover" style={{ width: 38, height: 38, flex: "0 0 38px", fontSize: 15, borderRadius: 13 }}>
            <Icon name="scissors" size={18} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mini-next-when">{fullLabel(shown.startAt, shown.salonTimezone ?? undefined)}</div>
            <div className="mini-next-sub">
              {faText(shown.service) || "نوبت"}
              {shown.employee ? ` · ${faText(shown.employee)}` : ""}
              {shown.note ? ` · یادداشت: ${shown.note}` : ""}
            </div>
          </div>
          {upcoming.length ? <span className="mini-countdown">{countdown(shown.startAt)}</span> : <StatusBadge status={shown.status} />}
        </div>
        {shown.depositAmount && !shown.depositPaid ? (
          <div className="mini-next-sub" style={{ marginTop: 8 }}>
            بیعانهٔ {toman(Number(shown.depositAmount))} هنوز پرداخت نشده است.
          </div>
        ) : null}
        {upcoming.length ? (
          <div className="mini-next-sub" style={{ marginTop: 6 }}>
            {salonName} — برای تغییر وقت یا لغو از دکمه‌های زیر استفاده کنید.
          </div>
        ) : null}
        <AppointmentActions
          appt={shown}
          onChangeTime={() => setMoveTarget(shown)}
          onCancel={() => setCancelTarget(shown)}
          onReview={() => setReviewTarget(shown)}
        />
        <div className="mini-option-sub" style={{ marginTop: 8 }}>{fromNow(shown.startAt)}</div>
      </div>

      <RescheduleSheet appt={moveTarget} onClose={() => setMoveTarget(null)} onDone={() => void load()} />
      <CancelSheet appt={cancelTarget} onClose={() => setCancelTarget(null)} onDone={() => void load()} />
      <ReviewSheet appt={reviewTarget} onClose={() => setReviewTarget(null)} onDone={() => void load()} />
    </>
  );
}
