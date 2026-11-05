/**
 * خانهٔ داشبورد مینی‌استایل — خلاصهٔ امروز، آمار، دسترسی سریع به بخش‌ها و
 * کنترل سبک داشبورد (فقط سوپرادمین).
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Icon, SectionTitle, SkeletonList } from "@/mini/components/ui";
import { compactToman, faDigits, timeLabel } from "@/mini/lib/format";
import type { AgendaItem } from "@/lib/appointments/agenda-view";
import { nextAppointment, summarize } from "@/lib/appointments/agenda-view";
import { usePageData } from "@/lib/page-data";
import { Tiles, PlanMeters, SalonSwitcher, StatGrid, type Tile } from "../lib/parts";
import { visibleSections } from "../lib/sections";
import { useDash } from "../lib/store";
import { requestClassic } from "../lib/classic";

type AgendaPayload = { agenda?: { dayISO: string; todayISO: string; timezone: string; rows: AgendaItem[] } };

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "سوپرادمین",
  SALON_OWNER: "مالک سالن",
  AGENT: "نماینده",
  CUSTOMER: "مشتری",
};

export default function DashHome() {
  const navigate = useNavigate();
  const { me, stats, statsLoading, payload, salon, salonId, publicUrl, canManage, isSuperAdmin } = useDash();

  /* خلاصهٔ امروز از همان بارگذاری نسخهٔ کلاسیک (agenda) — داده یکی است */
  const { data: agendaData, loading: agendaLoading } = usePageData<AgendaPayload>(
    "agenda",
    canManage && salonId ? { salon: salonId } : {}
  );
  const agenda = agendaData?.agenda;
  const rows = agenda?.rows ?? [];
  const sum = useMemo(() => summarize(rows), [rows]);
  const hero = useMemo(() => nextAppointment(rows, Date.now()), [rows]);

  const displayName = me?.name ?? me?.email ?? me?.phone ?? "";
  const roleLabel = ROLE_LABEL[me?.role ?? ""] ?? me?.role ?? "";

  const tiles: Tile[] = visibleSections(me?.role).map((s) => ({
    to: `/dash${s.to === "/" ? "" : s.to}`,
    label: s.label,
    sub: s.sub,
    icon: s.icon,
  }));

  return (
    <div className="mini-fade">
      {/* کارت خوش‌آمد */}
      <div className="mini-hero">
        <h1>سلام، {displayName}</h1>
        <p>
          {roleLabel}
          {salon?.name ? ` · ${salon.name}` : ""}
        </p>
        <div className="mini-hero-chips">
          <SalonSwitcher />
          <span className="mini-hero-chip">
            <Icon name="calendar" size={13} />
            امروز {faDigits(sum.total)} نوبت
          </span>
          {sum.requested ? (
            <span className="mini-hero-chip">
              <Icon name="clock" size={13} />
              {faDigits(sum.requested)} در انتظار تأیید
            </span>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <>
          <StatGrid
            loading={statsLoading}
            cells={[
              { value: faDigits(Number(stats?.today ?? 0)), label: "نوبت امروز" },
              { value: faDigits(Number(stats?.pending ?? 0)), label: "در انتظار تأیید" },
              { value: faDigits(Number(stats?.total ?? 0)), label: "کل نوبت‌ها" },
              { value: compactToman(Number(stats?.balance ?? 0)), label: "موجودی کیف پول" },
            ]}
          />

          {/* یک نگاه به امروز */}
          <SectionTitle title="امروز" hint={agenda ? `${faDigits(sum.total)} نوبت` : undefined} />
          {agendaLoading ? (
            <SkeletonList count={2} />
          ) : hero ? (
            <div className="mini-card">
              <div className="mini-appt-head">
                <b>نوبت بعدی — {hero.customerName}</b>
                <span className="mini-badge is-confirmed">{timeLabel(hero.startAt, agenda?.timezone)}</span>
              </div>
              <div className="mini-appt-body">
                <div>
                  {hero.service ?? "بدون خدمت"}
                  {hero.employee ? ` · ${hero.employee}` : ""}
                </div>
                {sum.requested > 0 ? <div>{faDigits(sum.requested)} نوبت در انتظار تأیید است.</div> : <div>کار در انتظار تأییدی نیست.</div>}
                {sum.depositDue > 0 ? <div>{compactToman(sum.depositDue)} بیعانهٔ پرداخت‌نشده.</div> : null}
              </div>
              <div className="mini-actions">
                <button type="button" className="mini-btn tiny" onClick={() => navigate(`/dash/appointments?salon=${salonId}`)}>
                  مدیریت نوبت‌های امروز
                </button>
                <a className="mini-btn ghost tiny" href={`tel:${hero.customerPhone}`} dir="ltr">
                  تماس
                </a>
              </div>
            </div>
          ) : (
            <div className="mini-card">
              <div className="mini-option-sub">{agenda ? "امروز نوبتی ثبت نشده است." : "برنامهٔ امروز در دسترس نیست."}</div>
              <div className="mini-actions" style={{ marginTop: 10 }}>
                <button type="button" className="mini-btn tiny" onClick={() => navigate("/dash/booking")}>
                  <Icon name="plus" size={16} />
                  ثبت نوبت دستی
                </button>
                <button type="button" className="mini-btn soft tiny" onClick={() => navigate("/dash/voice-booking")}>
                  <Icon name="mic" size={16} />
                  رزرو صوتی
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="mini-card">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>نقش شما: {roleLabel || "ناشناس"}</div>
          <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
            برای دیدن داشبورد سالن به حساب مالک سالن یا نماینده نیاز دارید. از منوی پایین بخش‌های «نوبت‌ها» و «حساب من» در دسترس شماست.
          </div>
        </div>
      )}

      {/* سوییچ سبک — فقط سوپرادمین */}
      {isSuperAdmin ? <StyleSwitcher /> : null}

      <SectionTitle title="بخش‌های داشبورد" hint="همهٔ امکانات نسخهٔ وب" />
      <Tiles items={tiles} />

      {canManage ? <PlanMeters snap={payload?.snap} planLabel={payload?.snap?.planLabel} /> : null}

      {publicUrl ? (
        <div style={{ marginTop: 14 }}>
          <Button variant="soft" onClick={() => window.open(publicUrl, "_blank", "noopener")}>
            <Icon name="link" size={17} />
            مشاهدهٔ صفحهٔ عمومی سالن
          </Button>
        </div>
      ) : null}

      <div className="mini-note" style={{ marginTop: 16 }}>
        این داشبورد همان دادهٔ پنل وب را نشان می‌دهد؛ اگر جایی به سبک مینی‌اپ بازنویسی نشده باشد، لینک «نسخهٔ وب» همان بخش را باز می‌کند.
      </div>
    </div>
  );
}

/* ── انتخاب سبک داشبورد (مخصوص سوپرادمین) ─────────────────────────── */

function StyleSwitcher() {
  const { salonId, salonStyleOverride, setSalonStyleOverride, style } = useDash();
  const navigate = useNavigate();

  return (
    <>
      <SectionTitle title="سبک داشبورد این سالن" hint={style === "mini" ? "مینی‌اپ" : "وب"} />
      <div className="mini-card">
        <div className="mini-option-sub" style={{ lineHeight: 1.9, marginBottom: 10 }}>
          انتخاب کنید داشبورد این سالن با سبک مینی‌اپ باز شود یا همان پنل وب قدیمی. تنظیم پیش‌فرض همهٔ سالن‌ها از «تنظیمات سیستم → سبک داشبورد» انجام می‌شود.
        </div>
        {!salonId ? (
          <div className="mini-note">اول یک سالن انتخاب کنید.</div>
        ) : (
          <div className="mini-chips">
            <button
              type="button"
              className={`mini-chip${salonStyleOverride === "mini" ? " is-on" : ""}`}
              onClick={() => void setSalonStyleOverride("mini")}
            >
              مینی‌اپ
            </button>
            <button type="button" className={`mini-chip${salonStyleOverride === "web" ? " is-on" : ""}`} onClick={() => void setSalonStyleOverride("web")}>
              وب قدیمی
            </button>
            <button
              type="button"
              className={`mini-chip${salonStyleOverride === "" ? " is-on" : ""}`}
              onClick={() => void setSalonStyleOverride("")}
            >
              پیش‌فرض سراسری
            </button>
          </div>
        )}
        <div className="mini-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="mini-btn ghost tiny"
            onClick={() => {
              requestClassic();
              navigate("/dashboard");
            }}
            title="فقط در همین تب، داشبورد وب را نشان بده"
          >
            <Icon name="link" size={15} />
            یک‌نظر به نسخهٔ وب
          </button>
        </div>
      </div>
    </>
  );
}
