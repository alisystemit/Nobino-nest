/**
 * صفحهٔ عمومی سالن (ریشهٔ ساب‌دامین و /s/:slug) در زبان طراحی مینی‌اپ.
 *
 * دو تجربه در یکی جمع شده‌اند:
 *  - آنچه نسخهٔ وب داشت: تقویم شمسی، رزرو با صدا، شعبه‌ها، گالری و لایت‌باکس،
 *    نقشهٔ نشان/بلد + جاسازی، تیم با تخصص‌ها و بیو، نظرات صفحه‌به‌صفحه،
 *    کیو‌آر، بنر نصب، دستیار هوشمند، JSON‑LD و متادیتا.
 *  - آنچه مینی‌اپ داشت: کارت «نوبت بعدی من» با تغییر وقت/لغو/نظر، انتخاب چند
 *    پکیج، آرایشگرِ هم‌خوان، نوار ۱۴ روز، ساعت‌های واقعاً آزاد، نزدیک‌ترین وقت،
 *    لیست انتظار، شیت ورود OTP، اطلاعیهٔ سراسری و رنگ/تم مینی‌اپ.
 *
 * هیچ فایلی زیر frontend/src/mini ویرایش نشده است؛ ماژول مینی‌اپ فقط import
 * می‌شود (کامپوننت‌ها + mini.css)، پس مسیرهای /mini/* دست‌نخورده می‌مانند.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AssistantChat from "@/components/AssistantChat";
import FavoriteButton from "@/components/FavoriteButton";
import Pagination from "@/components/ui/Pagination";
import SafeImage from "@/components/SafeImage";
import SalonAnimations from "@/components/SalonAnimations";
import SalonInstallBanner from "@/components/SalonInstallBanner";
import SalonQrCard from "@/components/SalonQrCard";
import { siteHref, siteHomeHref } from "./site-url";
import { localizeTexts } from "./text";
import { usePageData } from "@/lib/page-data";
import { useTheme } from "@/lib/theme";
import { joinLocation } from "@/lib/utils";
import { useMeta } from "@/lib/use-meta";
import LoginSheet from "@/mini/components/login-sheet";
import { Button, EmptyState, Icon, Row, SectionTitle, Sheet, SkeletonList, StarIcon } from "@/mini/components/ui";
import { MiniProvider, mapi, useMini } from "@/mini/lib/store";
import { faDigits, ratingText, todayWeekdayIndex, WEEKDAYS_FA } from "@/mini/lib/format";
import type { MiniService, MiniStaff } from "@/mini/lib/types";
import BookingPanel, { type BookingPreset } from "./BookingPanel";
import MyBookings from "./MyBookings";
import { buildMapDeepLinks, buildMapEmbed, instagramHref, openStatus, whatsappHref, type OpeningHour } from "./map-links";
import "@/mini/mini.css";
import "./salon.css";

/* ── شکل دادهٔ /api/pages/salon ─────────────────────────────────────── */

type RawStaff = {
  id: string;
  name: string;
  title?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  specialties?: string[] | null;
  branchId?: string | null;
  services?: { id: string }[];
};

type GalleryItem = { id: string; title: string | null; imageUrl: string; type?: string };

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string | Date;
  customer?: { name?: string | null } | null;
  staff?: { name?: string | null } | null;
};

type SalonRow = {
  id: string;
  slug: string;
  name: string;
  phone: string;
  city: string | null;
  address: string | null;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  coverColor: string | null;
  timezone: string;
  whatsapp: string | null;
  instagram: string | null;
  website: string | null;
  mapUrl: string | null;
  neshanUrl: string | null;
  baladUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  customDomain: string | null;
  domainStatus: string;
  maxAdvanceDays: number;
  services: MiniService[];
  galleryItems: GalleryItem[];
  openingHours: OpeningHour[];
  staff: RawStaff[];
  branches: { id: string; name: string; city?: string | null; address?: string | null }[];
};

type SalonPageData = {
  found: boolean;
  salon?: SalonRow;
  /** بینندهٔ لاگین‌شده مدیر همین سالن است → فرم رزرو مشتری نمایش داده نمی‌شود */
  isOwnerViewer?: boolean;
  reviews?: ReviewRow[];
  averageRating?: number;
  reviewCount?: number;
  reviewsTotalPages?: number;
  jsonLd?: Record<string, unknown>;
  meta?: { title?: string; description?: string };
};

const BANNER_KEY = "nobino.salon.banner.dismissed";

/** Staff ردیفِ دیتابیس → شکل MiniStaff که اجزای مینی‌اپ می‌خواهند */
function toMiniStaff(rows: RawStaff[]): MiniStaff[] {
  return rows.map((st) => ({
    id: st.id,
    name: st.name,
    title: st.title ?? "",
    avatarUrl: st.avatarUrl ?? "",
    specialties: Array.isArray(st.specialties) ? st.specialties : [],
    bio: st.bio ?? "",
    branchId: st.branchId ?? "",
    serviceIds: (st.services ?? []).map((s) => s.id),
    rating: null,
    reviewCount: 0,
  }));
}

/* ── پوسته: ریشهٔ مینی‌اپ +MiniProvider ─────────────────────────────── */

export default function SalonExperience({ slug }: { slug: string }) {
  const { theme } = useTheme();
  const [prefersDark, setPrefersDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setPrefersDark(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && prefersDark);

  return (
    <div className={`mini-root salon-page${isDark ? " dark" : ""}`} id="salon-page-root">
      <MiniProvider>
        <SalonInner slug={slug} isDark={isDark} />
      </MiniProvider>
    </div>
  );
}

/* ── بدنه ───────────────────────────────────────────────────────────── */

function SalonInner({ slug, isDark }: { slug: string; isDark: boolean }) {
  const { configReady, me, authReady, toast, toastNode } = useMini();
  const [reviewsPage, setReviewsPage] = useState(1);
  const { data, loading, error, reload } = usePageData<SalonPageData>("salon", {
    slug,
    reviewsPage: String(reviewsPage),
  });
  /* رقم‌های متن‌های دیتابیس (نام خدمت/شعبه/گالری/نظر) یک‌دست فارسی می‌شوند؛
     Yekan رقم لاتین ندارد وگرنه در یک خط دو فونت و دو وزن می‌سازد. ر.ک salon/text.ts */
  const salon = useMemo(() => (data?.found ? localizeTexts(data.salon) : undefined), [data]);
  useMeta(data?.meta?.title, data?.meta?.description);

  const [loginOpen, setLoginOpen] = useState(false);
  const [expandText, setExpandText] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [preset, setPreset] = useState<BookingPreset | undefined>(undefined);
  const [staffSheet, setStaffSheet] = useState<MiniStaff | null>(null);
  const [lightbox, setLightbox] = useState<number>(-1);
  const [bookedNonce, setBookedNonce] = useState(0);
  const [bookingInView, setBookingInView] = useState(false);
  const presetNonce = useRef(0);

  /* bootWebApp داخل MiniProvider رنگ‌مایهٔ سند را «light» می‌کند؛ اینجا با تم
     سایت هم‌گام می‌شود تا حالت تیرهٔ بقیهٔ صفحات نشکند. */
  useEffect(() => {
    if (!configReady) return;
    document.documentElement.style.setProperty("color-scheme", isDark ? "dark" : "light");
  }, [configReady, isDark]);

  /* ── اطلاعیهٔ سراسری (همان endpoint عمومی مینی‌اپ) ───────────────── */
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

  /* ── ?service و ?staff — لینک‌های مستقیم مینی‌اپ و استوری ─────────── */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = (q.get("service") || "").trim();
    const e = (q.get("staff") || q.get("employee") || "").trim();
    if (!s && !e) return;
    presetNonce.current += 1;
    setPreset({ serviceId: s || undefined, staffId: e || undefined, nonce: presetNonce.current });
  }, [slug]);

  const scrollToBooking = useCallback(() => {
    const el = document.getElementById("sm-booking");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /* ── دکمهٔ ثابت پایین فقط وقتی کارت رزرو دیده نمی‌شود بیاید ────────
     شنود روی `scroll` (نه IntersectionObserver یک‌باره) عمداً انتخاب شده:
     کارت رزرو بعد از آمدن داده و «نوبت بعدی شما» بارها از نو ساخته می‌شود،
     و ناظرِ گره‌ی قدیمی دیگر هیچ‌وقت شلیک نمی‌کرد. */
  useEffect(() => {
    const update = () => {
      const el = document.getElementById("sm-booking");
      if (!el) {
        setBookingInView(false);
        return;
      }
      const rect = el.getBoundingClientRect();
      setBookingInView(rect.top < window.innerHeight * 0.8 && rect.bottom > 110);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [salon?.id]);

  const staff = useMemo(() => toMiniStaff(salon?.staff ?? []), [salon]);
  const hours = useMemo(() => [...(salon?.openingHours ?? [])].sort((a, b) => a.dayOfWeek - b.dayOfWeek), [salon]);
  const gallery = useMemo(() => salon?.galleryItems ?? [], [salon]);
  const reviews = useMemo(() => (salon && Array.isArray(data?.reviews) ? localizeTexts(data.reviews) : []), [data, salon]);
  const timezone = salon?.timezone || "Asia/Tehran";
  const status = useMemo(() => openStatus(hours, timezone), [hours, timezone]);
  const today = todayWeekdayIndex(timezone);
  const maps = useMemo(() => (salon ? buildMapDeepLinks(salon) : { neshan: "", balad: "", hasCoords: false }), [salon]);
  const embed = useMemo(() => (salon ? buildMapEmbed(salon, maps.hasCoords) : ""), [salon, maps.hasCoords]);
  const hasMap = Boolean(salon && (salon.address || maps.hasCoords || salon.baladUrl || salon.neshanUrl || salon.mapUrl));

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

  function chooseBooking(patch: { serviceId?: string; staffId?: string }) {
    presetNonce.current += 1;
    setPreset({ ...patch, nonce: presetNonce.current });
    scrollToBooking();
  }

  function askReview() {
    if (!me) {
      setLoginOpen(true);
      return;
    }
    toast("برای ثبت نظر باید نوبتتان «انجام شده» شود؛ بعد از مراجعه، از کارت نوبت همین صفحه نظر بدهید.", "info");
  }

  /* ── حالت‌های بارگذاری / نبود صفحه ───────────────────────────────── */
  if (loading && !salon) {
    return (
      <div className="mini-fade sm-shell">
        <div className="mini-skeleton" style={{ height: 130 }} />
        <div style={{ height: 14 }} />
        <SkeletonList count={4} />
        {toastNode}
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="mini-fade sm-shell">
        <div className="sm-hero mini-hero">
          <div className="mini-hero-inner">
            <h1>صفحه یافت نشد</h1>
            <p>{error || "این سالن وجود ندارد یا هنوز تأیید و فعال نشده است."}</p>
          </div>
        </div>
        <EmptyState text="سالنی برای نمایش پیدا نشد." hint="نشانی را دوباره نگاه کنید یا از فهرست سالن‌ها انتخاب کنید." />
        <div className="mini-btn-row">
          <a className="mini-btn" href={siteHomeHref()} style={{ textDecoration: "none" }}>
            <Icon name="home" size={17} />
            خانهٔ نوبینو
          </a>
          <Button variant="ghost" onClick={reload}>
            <Icon name="refresh" size={17} />
            تلاش دوباره
          </Button>
        </div>
        {toastNode}
      </div>
    );
  }

  const coverStyle = salon.bannerUrl ? ({ "--mini-cover": `url(${salon.bannerUrl})` } as CSSProperties) : undefined;

  return (
    <div className="mini-fade">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data?.jsonLd ?? {}).replace(/</g, "\\u003c") }} />

      <div className="sm-shell">
        {/* ── نوار بالا ─────────────────────────────────────────────── */}
        <div className="mini-top">
          <span className="mini-brand-mark" aria-hidden="true">
            <Icon name="scissors" size={17} />
          </span>
          <div className="mini-brand">{salon.name}</div>
          <span className="mini-platform-chip">{status.label}</span>
          <div className="mini-top-actions">
            <button type="button" className="mini-icon-btn" onClick={scrollToBooking} aria-label="رفتن به رزرو نوبت" title="رزرو نوبت">
              <Icon name="calendar" size={17} />
            </button>
            <button
              type="button"
              className="mini-icon-btn"
              onClick={() => (me ? (window.location.href = siteHref("/dashboard/appointments")) : setLoginOpen(true))}
              aria-label={me ? "حساب من" : "ورود"}
              title={me ? "حساب من" : "ورود"}
            >
              <Icon name={me ? "user" : "logout"} size={17} />
            </button>
          </div>
        </div>

        {/* ── سربرگ سالن ────────────────────────────────────────────── */}
        <div className={`mini-hero sm-hero${salon.bannerUrl ? " has-cover" : ""}`} style={coverStyle}>
          <div className="sm-hero-deco">
            <SalonAnimations />
          </div>
          <div className="sm-hero-inner">
            <div className="mini-hero-row">
              <div className="mini-hero-cover">
                <SafeImage src={salon.logoUrl} alt={salon.name} className="h-full w-full object-cover" fallback={salon.name.slice(0, 1)} fallbackClassName="grid place-items-center" />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h1>{salon.name}</h1>
                <p>{joinLocation(salon.city, salon.address, " · ") || "سالن زیبایی"}</p>
              </div>
              <div className="sm-hero-fav">
                {/* مهمان نباید درخواست protected بزند — فقط وقتی نشست روشن شد می‌پرسیم */}
                <FavoriteButton
                  salonId={salon.id}
                  onLogin={() => setLoginOpen(true)}
                  sessionKey={me?.id ?? ""}
                  signedIn={me ? true : authReady ? false : null}
                />
              </div>
            </div>
            <div className="mini-hero-chips">
              {(data?.reviewCount ?? 0) > 0 ? (
                <span className="mini-hero-chip">
                  <StarIcon size={12} /> {faDigits(Number(data?.averageRating ?? 0).toFixed(1))} از ۵ · {faDigits(data?.reviewCount ?? 0)} نظر
                </span>
              ) : (
                <span className="mini-hero-chip">هنوز نظری ثبت نشده</span>
              )}
              <span className="mini-hero-chip">{faDigits(salon.services.length)} پکیج</span>
              {staff.length ? <span className="mini-hero-chip">{faDigits(staff.length)} آرایشگر</span> : null}
              <span className={`sm-open-chip${status.open ? " is-open" : " is-closed"}`}>
                <i aria-hidden="true" />
                {status.label}
              </span>
              {salon.phone ? (
                <a className="mini-hero-chip" href={`tel:${salon.phone}`} dir="ltr">
                  <Icon name="phone" size={12} /> {faDigits(salon.phone)}
                </a>
              ) : null}
            </div>
            <p className="mini-hero-hello">
              {me
                ? `سلام ${me.name || "عزیز"} 👋 نوبت‌هایت را همین‌جا ببین و در صورت نیاز جابه‌جا کن.`
                : "همین‌جا پکیج و ساعت آزاد را انتخاب کن؛ پیامک تأیید و یادآوری برایت می‌آید."}
            </p>
          </div>
        </div>

        {announcement ? <AnnouncementBanner text={announcement} /> : null}

        {/* ── چیدمان اصلی ───────────────────────────────────────────── */}
        <div className="sm-layout">
          <div className="sm-col-main">
            <MyBookings salonId={salon.id} salonName={salon.name} nonce={bookedNonce} />

            {data?.isOwnerViewer ? (
              /* مدیر همین سالن: رزرو مشتری‌محور بسته شده؛ راهش نوبت دستی/هوشمند در پنل است */
              <div className="mini-card" id="sm-booking" style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 900 }}>شما مدیر همین سالن هستید</div>
                <p className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
                  نوبت‌گیری به‌عنوان مشتری در سالن خود ممکن نیست؛ نوبت خود یا مشتری را از پنل ثبت کنید.
                </p>
                <div className="mini-actions" style={{ justifyContent: "center" }}>
                  <a className="mini-btn" href={siteHref("/dashboard/new-appointment")} style={{ textDecoration: "none" }}>
                    <Icon name="edit" size={17} />
                    ثبت نوبت دستی
                  </a>
                  <a className="mini-btn" href={siteHref("/dashboard/voice-booking")} style={{ textDecoration: "none" }}>
                    <Icon name="mic" size={17} />
                    ثبت نوبت هوشمند
                  </a>
                </div>
              </div>
            ) : (
              <BookingPanel
                salon={{
                  id: salon.id,
                  slug: salon.slug,
                  name: salon.name,
                  timezone,
                  maxAdvanceDays: salon.maxAdvanceDays,
                  phone: salon.phone,
                }}
                services={salon.services}
                staff={staff}
                branches={salon.branches ?? []}
                showPrices={true}
                bookingEnabled={true}
                requireLogin={false}
                preset={preset}
                onLoginRequired={() => setLoginOpen(true)}
                onBooked={() => setBookedNonce((n) => n + 1)}
              />
            )}

            {/* راهنمای کوتاه قوانین سالن — فقط informational */}
            <div className="mini-note">
              ساعت‌های خالی واقعی است؛ {faDigits(Math.max(0, Number(salon.maxAdvanceDays ?? 30)))} روز پیش‌رو قابل رزرو است.
              برای جابه‌جایی یا لغو، از کارت نوبت همین صفحه استفاده کن.
            </div>
          </div>

          <div className="sm-col-side">
            <SectionTitle title="دربارهٔ سالن" />
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
                <div className="mini-option-sub">این سالن هنوز توضیحی ننوشته است؛ برای آشنایی با پکیج‌ها و تیم، بخش‌های پایین را ببینید.</div>
              )}
              {contact.length ? (
                <div className="mini-contact">
                  {contact.map((c) => (
                    <a
                      key={c.href}
                      className="mini-btn ghost tiny"
                      href={c.href}
                      target={c.href.startsWith("tel:") ? undefined : "_blank"}
                      rel="noreferrer"
                      style={{ textDecoration: "none", width: "auto" }}
                    >
                      <Icon name={c.icon} size={15} />
                      {c.label}
                    </a>
                  ))}
                </div>
              ) : null}
              {salon.address ? (
                <>
                  <div className="mini-divider" />
                  <Row label="نشانی" value={salon.address} />
                  {salon.city ? <Row label="شهر" value={salon.city} /> : null}
                </>
              ) : null}
            </div>

            {hours.length ? (
              <>
                <SectionTitle title="ساعات کاری" hint={status.detail || undefined} />
                <div className="mini-card" style={{ padding: "4px 14px" }}>
                  {hours.map((h) => (
                    <div key={`${h.dayOfWeek}-${h.openTime}`} className={`mini-row${h.dayOfWeek === today ? " is-today" : ""}`}>
                      <span>{WEEKDAYS_FA[h.dayOfWeek] ?? `روز ${faDigits(h.dayOfWeek + 1)}`}</span>
                      <span>{h.isClosed ? "تعطیل" : `${faDigits(h.openTime)} تا ${faDigits(h.closeTime)}`}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {staff.length ? (
              <>
                <SectionTitle title="تیم ما" hint={`${faDigits(staff.length)} نفر`} />
                <div className="mini-list">
                  {staff.map((p) => (
                    <button key={p.id} type="button" className="mini-option" onClick={() => setStaffSheet(p)}>
                      <span className="mini-avatar">
                        {p.avatarUrl ? <img src={p.avatarUrl} alt="" loading="lazy" /> : p.name.slice(0, 1)}
                      </span>
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="mini-option-title" style={{ display: "block" }}>
                          {p.name}
                        </span>
                        <span className="mini-option-sub">
                          {p.title || "آرایشگر"}
                          {p.specialties.length ? ` · ${p.specialties.slice(0, 2).join("، ")}` : ""}
                        </span>
                      </span>
                      <span className="mini-option-price">{p.serviceIds.length ? `${faDigits(p.serviceIds.length)} پکیج` : ""}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <SectionTitle title="صفحهٔ سالن در گوشی" hint="QR را چاپ کنید" />
            <div className="mini-card">
              <p className="mini-option-sub" style={{ marginBottom: 10, lineHeight: 1.9 }}>
                همین کد را در ورودی سالن بگذارید یا در استوری share کنید؛ با اسکن، صفحهٔ رزرو همین‌جا باز می‌شود.
              </p>
              <SalonQrCard slug={salon.slug} name={salon.name} customDomain={salon.customDomain} domainStatus={salon.domainStatus} size={170} />
            </div>

            {/* بنر نصب اپ همان سالن — در جریان صفحه (نه شناور) تا روی فرم رزرو نیفتد */}
            <div className="sm-install">
              <SalonInstallBanner slug={salon.slug} name={salon.name} logoUrl={salon.logoUrl} />
            </div>
          </div>
        </div>

        {/* ── بخش‌های تمام‌عرض ───────────────────────────────────────── */}
        <div className="sm-after">
          {gallery.length ? (
            <>
              <SectionTitle title="نمونه‌کارها" hint={`${faDigits(gallery.length)} تصویر`} />
              <div className="sm-gallery">
                {gallery.map((g, i) => (
                  <button key={g.id} type="button" className="sm-gal" onClick={() => setLightbox(i)} aria-label={g.title ?? `تصویر ${i + 1}`}>
                    <SafeImage src={g.imageUrl} alt={g.title ?? salon.name} className="h-full w-full object-cover" fallback="🖼️" fallbackClassName="grid place-items-center text-3xl" />
                    {g.title ? <span>{g.title}</span> : null}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {hasMap ? (
            <>
              <SectionTitle title="موقعیت روی نقشه" hint={salon.address || undefined} />
              <div className="mini-card">
                <div className="sm-map-frame">
                  <iframe title={`نقشهٔ ${salon.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={embed} />
                </div>
                <div className="mini-btn-row" style={{ marginTop: 12 }}>
                  <a className="mini-btn soft" href={maps.neshan} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                    <Icon name="pin" size={17} />
                    باز کردن در نشان
                  </a>
                  <a className="mini-btn soft" href={maps.balad} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                    <Icon name="pin" size={17} />
                    باز کردن در بلد
                  </a>
                </div>
              </div>
            </>
          ) : null}

          <SectionTitle
            title="نظرات مشتریان"
            hint={ratingText(data?.averageRating ?? null, data?.reviewCount ?? 0)}
            action={
              <button type="button" className="mini-more" onClick={askReview}>
                ثبت نظر
              </button>
            }
          />
          {reviews.length === 0 ? (
            <div className="mini-note">هنوز نظری ثبت نشده است. پس از مراجعه می‌توانید اولین نظر را بنویسید.</div>
          ) : (
            <div className="sm-two">
              {reviews.map((r) => (
                <div key={r.id} className="mini-card sm-review">
                  <div className="sm-review-head">
                    <b style={{ fontSize: 13 }}>{r.customer?.name ?? "مشتری"}</b>
                    <span className="mini-stars">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} style={{ opacity: i < r.rating ? 1 : 0.25 }}>
                          <StarIcon size={12} />
                        </span>
                      ))}
                    </span>
                  </div>
                  {r.staff?.name ? <div className="mini-option-sub" style={{ marginTop: 4 }}>آرایشگر: {r.staff.name}</div> : null}
                  {r.comment ? <p className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>{r.comment}</p> : null}
                </div>
              ))}
            </div>
          )}
          {(data?.reviewsTotalPages ?? 1) > 1 ? (
            <Pagination page={reviewsPage} totalPages={data?.reviewsTotalPages ?? 1} total={data?.reviewCount ?? 0} onChange={setReviewsPage} />
          ) : null}
          <p className="mini-option-sub" style={{ textAlign: "center" }}>
            فقط مشتریانی که نوبت «انجام‌شده» در این سالن دارند می‌توانند نظر ثبت کنند.
          </p>
        </div>

        {/* فاصله برای دکمهٔ ثابت پایین */}
        <div style={{ height: 88 }} />
      </div>

      {/* ── دکمهٔ ثابت رزرو (موبایل) ────────────────────────────────── */}
      {!bookingInView ? (
        <div className="sm-cta">
          <div>
            {data?.isOwnerViewer ? (
              <a className="mini-btn" href={siteHref("/dashboard/new-appointment")} style={{ textDecoration: "none" }}>
                <Icon name="edit" size={18} />
                ثبت نوبت دستی در پنل
              </a>
            ) : (
              <Button onClick={scrollToBooking}>
                <Icon name="calendar" size={18} />
                رزرو نوبت در {salon.name}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* ── دستیار هوشمند (شناور) ────────────────────────────────────── */}
      <div className="sm-float-layer">
        <AssistantChat salonId={salon.id} />
      </div>

      {/* ── شیت آرایشگر ─────────────────────────────────────────────── */}
      <Sheet open={Boolean(staffSheet)} title={staffSheet?.name ?? ""} onClose={() => setStaffSheet(null)}>
        {staffSheet ? (
          <>
            <div className="sm-staff">
              <span className="sm-staff-cover">
                {staffSheet.avatarUrl ? <img src={staffSheet.avatarUrl} alt="" /> : staffSheet.name.slice(0, 1)}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 900 }}>{staffSheet.title || "آرایشگر"}</div>
                <div className="mini-option-sub" style={{ marginTop: 4 }}>
                  {staffSheet.serviceIds.length
                    ? `${faDigits(staffSheet.serviceIds.length)} پکیج را انجام می‌دهد`
                    : "روی همهٔ پکیج‌ها کار می‌کند"}
                </div>
              </div>
            </div>
            {staffSheet.specialties.length ? (
              <div className="mini-chips" style={{ marginTop: 12 }}>
                {staffSheet.specialties.map((sp) => (
                  <span key={sp} className="mini-tag">
                    {sp}
                  </span>
                ))}
              </div>
            ) : null}
            {staffSheet.bio ? <p className="mini-desc" style={{ marginTop: 12 }}>{staffSheet.bio}</p> : null}
            <div style={{ marginTop: 14 }}>
              <Button
                onClick={() => {
                  chooseBooking({ staffId: staffSheet.id });
                  setStaffSheet(null);
                }}
              >
                <Icon name="check" size={18} />
                رزرو با {staffSheet.name}
              </Button>
            </div>
          </>
        ) : null}
      </Sheet>

      {/* ── لایت‌باکس گالری ─────────────────────────────────────────── */}
      <Sheet open={lightbox >= 0 && lightbox < gallery.length} title={gallery[lightbox]?.title ?? "نمونه‌کار"} onClose={() => setLightbox(-1)}>
        {lightbox >= 0 && gallery[lightbox] ? (
          <>
            <div className="sm-lightbox">
              <img src={gallery[lightbox].imageUrl} alt={gallery[lightbox].title ?? salon.name} />
            </div>
            {gallery.length > 1 ? (
              <div className="mini-btn-row" style={{ marginTop: 12 }}>
                <Button variant="ghost" onClick={() => setLightbox((i) => (i - 1 + gallery.length) % gallery.length)}>
                  قبلی
                </Button>
                <Button variant="soft" onClick={() => setLightbox((i) => (i + 1) % gallery.length)}>
                  بعدی
                </Button>
              </div>
            ) : null}
            <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center" }}>
              {faDigits(lightbox + 1)} از {faDigits(gallery.length)} — {salon.name}
            </div>
          </>
        ) : null}
      </Sheet>

      <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} reason="با ورود، نوبت‌هایتان در همین صفحه می‌آید و می‌توانید وقت را تغییر دهید یا لغو کنید." />
      {toastNode}
    </div>
  );
}

/* ── بنر اطلاعیهٔ سوپرادمین ─────────────────────────────────────────── */

/** همان بنر مینی‌اپ؛ ✕ آن را تا عوض شدن متن بسته نگه می‌دارد */
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
        ✕
      </button>
    </div>
  );
}
