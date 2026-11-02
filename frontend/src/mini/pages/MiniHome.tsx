/**
 * صفحهٔ اول مینی‌اپ — خانهٔ سالن‌محور.
 *
 * برخلاف نسخهٔ اول، اینجا دیگر فهرست یا جست‌وجوی «همهٔ سالن‌ها» وجود ندارد:
 * کاربر فقط سالن خودش را می‌بیند (زنجیرهٔ تشخیص در ./lib/resolve.ts) و صفحه
 * همان معرفی سالن است — توضیحات، تازه‌ترین پکیج‌ها، آرایشگران، ساعات کاری،
 * راه‌های تماس و دکمهٔ رزرو. رزرو از مسیر /mini/s/<slug> انجام می‌شود.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppointmentActions, CancelSheet, RescheduleSheet, ReviewSheet, countdown } from "../components/appt-actions";
import LoginSheet from "../components/login-sheet";
import { Button, EmptyState, Icon, Row, SectionTitle, SkeletonList, StarIcon } from "../components/ui";
import { duration, faDigits, fullLabel, ratingText, shortPrice, toman, todayWeekdayIndex, WEEKDAYS_FA, ymd } from "../lib/format";
import { SOURCE_LABEL, resolveHomeSalon, type HomeSalon } from "../lib/resolve";
import { mapi, useMini } from "../lib/store";
import type { MiniAppointment, MiniReview, MiniSalonDetail, MiniStaff } from "../lib/types";

const PACKAGES_SHOWN = 6;

/** شمارهٔ واتساپ ممکن است عدد خام یا لینک کامل باشد */
function whatsappHref(value: string): string {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits.startsWith("0") ? `98${digits.slice(1)}` : digits}`;
}

function instagramHref(value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://instagram.com/${v.replace(/^@+/, "")}`;
}

export default function MiniHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, configReady, authReady, me, messengerName, platformLabel } = useMini();

  const [home, setHome] = useState<HomeSalon | null>(null);
  const [salon, setSalon] = useState<MiniSalonDetail | null>(null);
  const [staff, setStaff] = useState<MiniStaff[]>([]);
  const [reviews, setReviews] = useState<MiniReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expandText, setExpandText] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [nextAppt, setNextAppt] = useState<MiniAppointment | null>(null);
  const [moveFor, setMoveFor] = useState<MiniAppointment | null>(null);
  const [cancelFor, setCancelFor] = useState<MiniAppointment | null>(null);
  const [reviewFor, setReviewFor] = useState<MiniAppointment | null>(null);

  /* ── اطلاعیهٔ سراسری نوبینو (یک بار، بدون نیاز به ورود) ───────────── */
  useEffect(() => {
    if (!configReady) return;
    let alive = true;
    void (async () => {
      const res = await mapi<{ success: boolean; announcement?: string | null }>("/api/public/announcement");
      if (alive && res.ok) setAnnouncement(String(res.data?.announcement ?? "").trim());
    })();
    return () => {
      alive = false;
    };
  }, [configReady]);

  /* ── نوبت بعدیِ این مشتری (فقط برای حساب CUSTOMER) ────────────────── */
  const loadNext = useCallback(async () => {
    if (!me || me.role !== "CUSTOMER") {
      setNextAppt(null);
      return;
    }
    const from = ymd(new Date(), salon?.timezone || "Asia/Tehran");
    const res = await mapi<{ success: boolean; appointments?: MiniAppointment[] }>(`/api/appointments?limit=20&from=${from}`);
    const rows = Array.isArray(res.data?.appointments) ? res.data.appointments : [];
    const upcoming = rows
      .filter((a) => a.status === "REQUESTED" || a.status === "CONFIRMED")
      .filter((a) => new Date(a.endAt).getTime() > Date.now())
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    setNextAppt(upcoming[0] ?? null);
  }, [me, salon?.timezone]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  /* ── ۱) تشخیص سالن این کاربر ─────────────────────────────────────── */
  useEffect(() => {
    if (!configReady || !authReady) return;
    let alive = true;
    setLoading(true);
    setLoadError("");
    void (async () => {
      const resolved = await resolveHomeSalon({ search: location.search, me, defaultSalon: config.defaultSalon });
      if (!alive) return;
      setHome(resolved);
      if (resolved.source === "none") {
        setSalon(null);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [configReady, authReady, me, config.defaultSalon, location.search]);

  /* ── ۲) بارگذاری همان سالن (+ آرایشگران و نظرها) ─────────────────── */
  const loadSalon = useCallback(async (slug: string) => {
    setLoading(true);
    setLoadError("");
    const detail = await mapi<{ success: boolean; error?: string; salon?: MiniSalonDetail }>(`/api/salons/${slug}`);
    if (!detail.ok || !detail.data.salon) {
      setSalon(null);
      setLoadError(detail.data?.error || "این سالن در دسترس نیست.");
      setLoading(false);
      return;
    }
    setSalon(detail.data.salon);

    const [staffRes, reviewsRes] = await Promise.all([
      mapi<{ success: boolean; staff?: MiniStaff[] }>(`/api/mini/staff?slug=${encodeURIComponent(slug)}`),
      config.features.reviews
        ? mapi<{ success: boolean; reviews?: MiniReview[] }>(`/api/salons/${slug}/reviews?limit=3`)
        : Promise.resolve(null),
    ]);
    if (staffRes.ok && Array.isArray(staffRes.data?.staff)) setStaff(staffRes.data.staff);
    if (reviewsRes?.ok && Array.isArray(reviewsRes.data?.reviews)) setReviews(reviewsRes.data.reviews);
    setLoading(false);
  }, [config.features.reviews]);

  useEffect(() => {
    if (!home || !home.slug) return;
    void loadSalon(home.slug);
  }, [home, loadSalon]);

  /* ── مشتقات نمایش ────────────────────────────────────────────────── */
  const packages = useMemo(
    () =>
      [...(salon?.services ?? [])].sort((a, b) =>
        String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")) || a.name.localeCompare(b.name, "fa")
      ),
    [salon]
  );
  const hours = useMemo(() => [...(salon?.hours ?? [])].sort((a, b) => a.dayOfWeek - b.dayOfWeek), [salon]);
  const today = todayWeekdayIndex(salon?.timezone || "Asia/Tehran");
  const average = useMemo(() => {
    if (!reviews.length) return null;
    return Number((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1));
  }, [reviews]);

  const greeting = useMemo(() => {
    const name = me?.name || messengerName;
    if (name) return `سلام ${name} 👋`;
    return `سلام 👋 در ${platformLabel} هستید`;
  }, [me?.name, messengerName, platformLabel]);

  const contact = useMemo(() => {
    if (!salon) return [] as { label: string; href: string; icon: "phone" | "link" }[];
    const list: { label: string; href: string; icon: "phone" | "link" }[] = [];
    if (salon.phone) list.push({ label: "تماس", href: `tel:${salon.phone}`, icon: "phone" });
    if (salon.whatsapp) {
      const href = whatsappHref(salon.whatsapp);
      if (href) list.push({ label: "واتساپ", href, icon: "link" });
    }
    const map = salon.mapUrl || salon.neshanUrl || salon.baladUrl;
    if (map) list.push({ label: "مسیریابی", href: map, icon: "link" });
    if (salon.instagram) {
      const href = instagramHref(salon.instagram);
      if (href) list.push({ label: "اینستاگرام", href, icon: "link" });
    }
    if (salon.website) list.push({ label: "وب‌سایت", href: salon.website, icon: "link" });
    return list;
  }, [salon]);

  const openBooking = (serviceId?: string) => {
    if (!home?.slug) return;
    navigate(`/mini/s/${home.slug}${serviceId ? `?service=${encodeURIComponent(serviceId)}` : ""}`);
  };

  /* ── حالت‌های بدون سالن ──────────────────────────────────────────── */
  if (home && home.source === "none") {
    return (
      <div className="mini-fade">
        <div className="mini-hero">
          <h1>{config.brand.title}</h1>
          <p>{config.brand.heroText || config.brand.subtitle}</p>
        </div>
        {announcement ? <AnnouncementBanner text={announcement} /> : null}
        <div style={{ height: 14 }} />
        <EmptyState
          text={me ? "هنوز سالنی به این حساب وصل نیست" : "برای دیدن سالن خودتان وارد شوید"}
          hint={
            me
              ? "اگر مشتری این سالن هستید و قبلاً نوبت گرفته‌اید، با همان شمارهٔ تلفن وارد شوید."
              : "ورود با پیام‌رسان یا شمارهٔ موبایل، سالن شما را در صفحهٔ خانه می‌آورد."
          }
        />
        {!me ? (
          <Button onClick={() => setLoginOpen(true)}>
            <Icon name="user" size={18} />
            ورود / ساخت حساب
          </Button>
        ) : null}
        {config.brand.supportPhone ? (
          <div className="mini-card" style={{ marginTop: 14 }}>
            <Row label="پشتیبانی" value={<a className="mini-link" href={`tel:${config.brand.supportPhone}`} dir="ltr">{faDigits(config.brand.supportPhone)}</a>} />
          </div>
        ) : null}
        <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} reason="بعد از ورود، صفحهٔ خانهٔ مینی‌اپ سالن شما را نشان می‌دهد." />
      </div>
    );
  }

  if (loading && !salon) {
    return (
      <div className="mini-fade">
        <div className="mini-skeleton" style={{ height: 128 }} />
        <div style={{ height: 14 }} />
        <SkeletonList count={4} />
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="mini-fade">
        <EmptyState text={loadError || "سالنی برای نمایش پیدا نشد."} hint="چند لحظه دیگر دوباره امتحان کنید یا با پشتیبانی تماس بگیرید." />
        <Button variant="ghost" onClick={() => void loadSalon(home?.slug || "")} disabled={!home?.slug}>
          <Icon name="refresh" size={17} />
          تلاش دوباره
        </Button>
      </div>
    );
  }

  const isOwner = home?.source === "owner";

  return (
    <div className="mini-fade">
      {/* ── سربرگ سالن ──────────────────────────────────────────────── */}
      <div className={`mini-hero${salon.bannerUrl ? " has-cover" : ""}`} style={salon.bannerUrl ? ({ "--mini-cover": `url(${salon.bannerUrl})` } as CSSProperties) : undefined}>
        <div className="mini-hero-row">
          <div className="mini-hero-cover">{salon.logoUrl ? <img src={salon.logoUrl} alt="" /> : salon.name.slice(0, 1)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1>{salon.name}</h1>
            <p>{[salon.city, salon.address].filter(Boolean).join(" · ") || config.brand.subtitle}</p>
          </div>
        </div>
        <div className="mini-hero-chips">
          {average != null ? (
            <span className="mini-hero-chip">
              <StarIcon size={12} /> {faDigits(average.toFixed(1))}
            </span>
          ) : null}
          <span className="mini-hero-chip">{faDigits(salon.services.length)} پکیج</span>
          {staff.length ? <span className="mini-hero-chip">{faDigits(staff.length)} آرایشگر</span> : null}
          {isOwner ? <span className="mini-hero-chip is-you">سالن شما</span> : null}
        </div>
        <p className="mini-hero-hello">{greeting}</p>
      </div>

      {/* ── اطلاعیهٔ سراسری ─────────────────────────────────────────── */}
      {announcement ? <AnnouncementBanner text={announcement} /> : null}

      {/* ── نوبت بعدی من ────────────────────────────────────────────── */}
      {nextAppt ? (
        <>
          <SectionTitle
            title="نوبت بعدی شما"
            action={
              <button type="button" className="mini-more" onClick={() => navigate("/mini/appointments")}>
                همهٔ نوبت‌ها
              </button>
            }
          />
          <div className="mini-next">
            <div className="mini-next-head">
              <span className="mini-hero-cover" style={{ width: 38, height: 38, flex: "0 0 38px", fontSize: 15, borderRadius: 13 }}>
                {salon.logoUrl ? <img src={salon.logoUrl} alt="" /> : (nextAppt.salonName || "ن").slice(0, 1)}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="mini-next-when">{fullLabel(nextAppt.startAt, nextAppt.salonTimezone ?? undefined)}</div>
                <div className="mini-next-sub">
                  {nextAppt.service ?? "نوبت"}
                  {nextAppt.employee ? ` · ${nextAppt.employee}` : ""}
                </div>
              </div>
              <span className="mini-countdown">{countdown(nextAppt.startAt)}</span>
            </div>
            {nextAppt.depositAmount && !nextAppt.depositPaid ? (
              <div className="mini-next-sub" style={{ marginTop: 8 }}>
                بیعانهٔ {toman(Number(nextAppt.depositAmount))} هنوز پرداخت نشده است.
              </div>
            ) : null}
            <AppointmentActions
              appt={nextAppt}
              onChangeTime={() => setMoveFor(nextAppt)}
              onCancel={() => setCancelFor(nextAppt)}
              onReview={() => setReviewFor(nextAppt)}
            />
          </div>
        </>
      ) : null}

      {/* ── توضیحات ─────────────────────────────────────────────────── */}
      <SectionTitle title="دربارهٔ سالن" hint={home && home.source !== "default" ? SOURCE_LABEL[home.source] : undefined} />
      <div className="mini-card">
        {salon.description ? (
          <>
            <p className={`mini-desc${expandText ? "" : " is-clamp"}`}>{salon.description}</p>
            {salon.description.length > 170 ? (
              <button type="button" className="mini-more" onClick={() => setExpandText((v) => !v)}>
                {expandText ? "بستن توضیحات" : "نمایش توضیحات کامل"}
              </button>
            ) : null}
          </>
        ) : (
          <div className="mini-option-sub">این سالن هنوز توضیحی ننوشته است؛ برای آشنایی با خدمات، بخش پایین را ببینید.</div>
        )}
        {contact.length ? (
          <div className="mini-contact">
            {contact.map((c) => (
              <a key={c.href} className="mini-btn ghost tiny" href={c.href} target={c.href.startsWith("tel:") ? undefined : "_blank"} rel="noreferrer" style={{ textDecoration: "none" }}>
                <Icon name={c.icon} size={15} />
                {c.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── تازه‌ترین پکیج‌ها ────────────────────────────────────────── */}
      <SectionTitle
        title="تازه‌ترین پکیج‌ها"
        hint={packages.length > PACKAGES_SHOWN ? `${faDigits(packages.length)} پکیج` : undefined}
        action={
          packages.length > PACKAGES_SHOWN ? (
            <button type="button" className="mini-more" onClick={() => openBooking()}>
              همهٔ پکیج‌ها
            </button>
          ) : null
        }
      />
      {packages.length === 0 ? (
        <div className="mini-note">این سالن هنوز پکیجی تعریف نکرده است؛ برای نوبت سرخود با سالن تماس بگیرید.</div>
      ) : (
        <div className="mini-list">
          {packages.slice(0, PACKAGES_SHOWN).map((s) => (
            <button key={s.id} type="button" className="mini-option" onClick={() => openBooking(s.id)}>
              <span className="mini-pkg-mark">
                <Icon name="sparkle" size={16} />
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="mini-option-title" style={{ display: "block" }}>{s.name}</span>
                <span className="mini-option-sub">
                  {s.category ? <span className="mini-tag">{s.category}</span> : null}
                  {duration(s.durationMin)}
                  {s.description ? ` · ${s.description}` : ""}
                </span>
              </span>
              {config.brand.showPrices ? <span className="mini-option-price">{shortPrice(s.price)}</span> : null}
            </button>
          ))}
        </div>
      )}

      {/* ── آرایشگران ───────────────────────────────────────────────── */}
      {staff.length ? (
        <>
          <SectionTitle title="تیم ما" hint={`${faDigits(staff.length)} نفر`} />
          <div className="mini-avatars">
            {staff.map((p) => (
              <button key={p.id} type="button" className="mini-pick" onClick={() => openBooking()}>
                <div className="mini-avatar">{p.avatarUrl ? <img src={p.avatarUrl} alt="" loading="lazy" /> : p.name.slice(0, 1)}</div>
                <b>{p.name}</b>
                <span>{p.title || (p.rating != null ? `${faDigits(Number(p.rating).toFixed(1))}★` : "آرایشگر")}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* ── ساعات کاری ──────────────────────────────────────────────── */}
      {hours.length ? (
        <>
          <SectionTitle title="ساعات کاری" hint="بر اساس منطقهٔ زمانی سالن" />
          <div className="mini-card" style={{ padding: "4px 14px" }}>
            {hours.map((h) => (
              <div key={h.dayOfWeek} className={`mini-row${h.dayOfWeek === today ? " is-today" : ""}`}>
                <span>{WEEKDAYS_FA[h.dayOfWeek] ?? `روز ${faDigits(h.dayOfWeek + 1)}`}</span>
                <span>{h.isClosed ? "تعطیل" : `${faDigits(h.openTime)} تا ${faDigits(h.closeTime)}`}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* ── نظرها ───────────────────────────────────────────────────── */}
      {reviews.length ? (
        <>
          <SectionTitle title="نظر مشتریان" hint={ratingText(average, reviews.length)} />
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
            </div>
          ))}
        </>
      ) : null}

      <div style={{ height: 96 }} />
      <div className="mini-sticky-cta">
        <div>
          {config.features.booking ? (
            <Button onClick={() => openBooking()}>
              <Icon name="calendar" size={18} />
              گرفتن نوبت در {salon.name}
            </Button>
          ) : salon.phone ? (
            <a className="mini-btn" href={`tel:${salon.phone}`} style={{ textDecoration: "none" }}>
              <Icon name="phone" size={18} />
              تماس با سالن
            </a>
          ) : null}
        </div>
      </div>

      <RescheduleSheet appt={moveFor} onClose={() => setMoveFor(null)} onDone={() => void loadNext()} />
      <CancelSheet appt={cancelFor} onClose={() => setCancelFor(null)} onDone={() => void loadNext()} />
      <ReviewSheet appt={reviewFor} onClose={() => setReviewFor(null)} onDone={() => void loadNext()} />
    </div>
  );
}

/** بنر اطلاعیهٔ سراسری که سوپرادمین از پنل تنظیم می‌کند */
const BANNER_KEY = "nobino.mini.banner.dismissed";

/** بنر اطلاعیهٔ سوپرادمین؛ ✕ آن را تا عوض شدن متن پیام بسته نگه می‌دارد */
function AnnouncementBanner({ text }: { text: string }) {
  const [closed, setClosed] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) === text;
    } catch {
      return false;
    }
  });
  if (closed) return null;
  function close() {
    setClosed(true);
    try {
      localStorage.setItem(BANNER_KEY, text);
    } catch {
      /* حالت خصوصی مرورگر */
    }
  }
  return (
    <div className="mini-banner">
      <Icon name="info" size={17} />
      <div style={{ minWidth: 0, flex: 1 }}>{text}</div>
      <button type="button" className="mini-more" onClick={close} aria-label="بستن اطلاعیه" style={{ flex: "0 0 auto", padding: 0 }}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
