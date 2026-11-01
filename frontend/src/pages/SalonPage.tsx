/**
 * صفحهٔ عمومی سالن — معادل src/app/s/[slug]/page.tsx.
 * دیتا (شامل JSON-LD و متادیتا) از /api/pages/salon?slug= می‌آید.
 */
import { useState } from "react";
import { useParamsTyped, Link } from "@/router-shim";
import SalonBooking from "@/components/SalonBooking";
import AssistantChat from "@/components/AssistantChat";
import FavoriteButton from "@/components/FavoriteButton";
import SafeImage from "@/components/SafeImage";
import SalonIcon from "@/components/icons/SalonIcon";
import Pagination from "@/components/ui/Pagination";
import { toPersianDigits, formatToman } from "@/lib/utils";
import { usePageData } from "@/lib/page-data";
import { useMeta } from "@/lib/use-meta";
import SalonQrCard from "@/components/SalonQrCard";
import SalonInstallBanner from "@/components/SalonInstallBanner";
import SalonAnimations from "@/components/SalonAnimations";

const days = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

/** مختصات معتبر سالن یا null — با Number(null) سالنِ بی‌مختصات روی ۰،۰ پین می‌شد */
function toCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ساخت لینک‌های پویای «نشان» و «بلد» برای هر سالن:
 *   ۱) لینکی که صاحب سالن در بخش ساخت/ویرایش تنظیم کرده (neshanUrl/baladUrl)
 *   ۲) پین روی مختصات ثبت‌شدهٔ همان سالن
 *   ۳) جست‌وجوی نام/شهر/آدرس سالن
 */
function buildMapDeepLinks(salon: any): { neshan: string; balad: string; hasCoords: boolean } {
  const q = [salon.name, salon.city, salon.address].filter(Boolean).join(" ").trim();
  const lat = toCoord(salon.latitude);
  const lng = toCoord(salon.longitude);
  const hasCoords =
    lat !== null &&
    lng !== null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180;
  const fmt = (n: number) => n.toFixed(6);
  return {
    hasCoords,
    neshan:
      salon.neshanUrl ||
      (hasCoords
        ? `https://neshan.org/maps/share/${fmt(lat!)},${fmt(lng!)}`
        : `https://neshan.org/maps/search/${encodeURIComponent(q)}`),
    balad:
      salon.baladUrl ||
      (hasCoords
        ? `https://balad.ir/#16/${fmt(lat!)}/${fmt(lng!)}`
        : `https://balad.ir/search?text=${encodeURIComponent(q)}`),
  };
}

/** لینک جاسازسی نقشهٔ سالن — فقط نشانی‌های embeddable؛ وگرنه از مختصات/آدرس ساخته می‌شود */
function buildMapEmbed(salon: any, hasCoords: boolean): string {
  const q = [salon.address, salon.city].filter(Boolean).join(" ").trim();
  const fallback = hasCoords
    ? `https://maps.google.com/maps?q=${toCoord(salon.latitude)},${toCoord(salon.longitude)}&z=16&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent(q || salon.name || "")}&z=15&output=embed`;
  const explicit = typeof salon.mapUrl === "string" ? salon.mapUrl : "";
  return explicit.includes("output=embed") ? explicit : fallback;
}

export default function SalonPage({ slug: slugProp }: { slug?: string }) {
  const params = useParamsTyped<{ slug: string }>();
  const slug = slugProp ?? params.slug;
  // صفحه‌بندی نظرات — دیتا از همان هندلرِ /api/pages/salon می‌آید (۱۲ نظر در هر صفحه)
  const [reviewsPage, setReviewsPage] = useState(1);
  const { data, loading } = usePageData<any>("salon", { slug, reviewsPage: String(reviewsPage) });

  useMeta(data?.meta?.title, data?.meta?.description);

  if (loading && !data) {
    return <main className="mx-auto max-w-5xl px-4 py-16 text-center text-neutral-500">در حال بارگذاری…</main>;
  }
  if (!data || !data.found) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-5xl">🪞</div>
        <h1 className="text-2xl font-black text-neutral-900">صفحه یافت نشد</h1>
        <p className="text-sm text-neutral-500">این سالن وجود ندارد یا هنوز تأیید/فعال نشده است.</p>
        <Link href="/salons" className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white">مشاهده سالن‌ها</Link>
      </main>
    );
  }

  const salon = data.salon;
  const maps = buildMapDeepLinks(salon);
  const reviews = data.reviews as any[];
  const averageRating = data.averageRating as number;
  const reviewCount = data.reviewCount as number;

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(data.jsonLd).replace(/</g, "\\u003c") }}
      />
      <AssistantChat salonId={salon.id} />
      {/* بنر یک‌کلیک نصب اپ — میانبرِ همان سالن روی گوشی ساخته می‌شود */}
      <SalonInstallBanner slug={salon.slug} name={salon.name} logoUrl={salon.logoUrl} />
      {/* Header */}
      <header className="relative h-[18rem] w-full sm:h-80">
        <div
          className="absolute inset-0 animate-gradient"
          style={{ background: `linear-gradient(135deg, ${salon.coverColor}, #7c3aed)` }}
        />
        {/* بنر سالن؛ اگر سالن بنری آپلود نکرده، تصویر نمونهٔ برداری نمایش داده می‌شود */}
        <SafeImage
          src={salon.bannerUrl ?? "/seed/hero.svg"}
          alt={`بنر ${salon.name}`}
          className="absolute inset-0 hidden h-full w-full object-cover sm:block"
          fallback=""
          fallbackClassName="absolute inset-0 !bg-gradient-to-br !from-pink-500 !to-purple-700"
        />
        <div className="absolute inset-0 bg-hero-pattern" />
        <SalonAnimations />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-6xl px-4 pb-6 sm:px-6 sm:pb-8">
          <div className="flex items-end gap-3 sm:gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white/70 bg-white/90 text-5xl shadow-2xl backdrop-blur sm:h-28 sm:w-28 sm:rounded-3xl">
              <SafeImage
                src={salon.logoUrl}
                alt={salon.name}
                className="h-full w-full rounded-xl object-contain sm:rounded-2xl"
                fallback={<SalonIcon className="h-10 w-10 sm:h-14 sm:w-14" />}
                fallbackClassName="h-full w-full rounded-xl sm:rounded-2xl"
              />
            </div>
            <div className="min-w-0 flex-1 text-white">
              <h1 className="text-2xl font-black leading-tight drop-shadow sm:text-4xl">{salon.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85 sm:gap-x-4 sm:text-sm">
                <span className="inline-flex items-center gap-1.5">📍 {salon.city} {salon.address}</span>
                <span className="inline-flex items-center gap-1.5" dir="ltr">📞 {toPersianDigits(salon.phone)}</span>
                {salon.instagram && (
                  <a
                    href={salon.instagram.startsWith("http") ? salon.instagram : `https://${salon.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 underline-offset-2 transition hover:underline"
                  >
                    📷 اینستاگرام
                  </a>
                )}
                {reviewCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-amber-200">
                    ★ <b>{toPersianDigits(averageRating)}</b> از ۵ — {toPersianDigits(reviewCount)} نظر
                  </span>
                )}
              </div>
            </div>
            <div className="ms-auto flex shrink-0 flex-col items-end gap-2">
              <FavoriteButton salonId={salon.id} />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10 lg:grid-cols-[1fr_380px]">
        {/* Main column */}
        <div className="order-2 space-y-8 sm:space-y-10 lg:order-1">
          <section>
            <h2 className="text-xl font-extrabold text-neutral-900">درباره سالن</h2>
            <p className="mt-3 leading-relaxed text-neutral-600">{salon.description ?? "توضیحی ثبت نشده است."}</p>
          </section>

          {(salon.address || maps.hasCoords || salon.baladUrl || salon.neshanUrl || salon.mapUrl) && (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-extrabold text-neutral-900">موقعیت روی نقشه</h2>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={maps.neshan}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-green-50 px-4 text-xs font-bold text-green-700 transition hover:bg-green-100 dark:bg-green-950/40 dark:text-green-300"
                  >
                    🧭 باز کردن در نشان
                  </a>
                  <a
                    href={maps.balad}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-purple-50 px-4 text-xs font-bold text-purple-700 transition hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300"
                  >
                    🗺️ باز کردن در بلد
                  </a>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200">
                <iframe
                  title="موقعیت سالن"
                  className="h-64 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={buildMapEmbed(salon, maps.hasCoords)}
                />
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-xl">✂️</span>
              <h2 className="text-xl font-extrabold text-neutral-900">خدمات</h2>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {salon.services.map((s: any) => (
                <div key={s.id} className="group card-hover relative overflow-hidden rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="absolute -left-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-pink-100 to-purple-100 opacity-0 transition group-hover:opacity-100 dark:from-pink-900/40 dark:to-purple-900/40" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-extrabold text-neutral-900 dark:text-neutral-100">{s.name}</h3>
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        ⏱ {toPersianDigits(s.durationMin)} دقیقه
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="text-base font-black text-pink-600">{formatToman(s.price)}</div>
                      <div className="text-[10px] text-neutral-400">تومان</div>
                    </div>
                  </div>
                  {s.description && <p className="relative mt-3 text-sm text-neutral-500 dark:text-neutral-400">{s.description}</p>}
                </div>
              ))}
            </div>
          </section>

          {salon.staff.length > 0 && (
            <section>
              <h2 className="text-xl font-extrabold text-neutral-900">تیم آرایشگران</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {salon.staff.map((st: any) => (
                  <div key={st.id} className="flex items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-2xl dark:bg-pink-900/40">
                      <SafeImage
                        src={st.avatarUrl}
                        alt={st.name}
                        className="h-full w-full rounded-full object-cover"
                        fallback="✂️"
                        fallbackClassName="h-full w-full rounded-full text-2xl"
                      />
                    </div>
                    <div>
                      <h3 className="font-bold text-neutral-900 dark:text-neutral-100">{st.name}</h3>
                      {st.title && <p className="text-xs text-pink-600">{st.title}</p>}
                      {st.specialties.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {st.specialties.map((sp: string) => (
                            <span key={sp} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                              {sp}
                            </span>
                          ))}
                        </div>
                      )}
                      {st.bio && <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{st.bio}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {salon.galleryItems.length > 0 && (
            <section>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-xl">🖼️</span>
                <h2 className="text-xl font-extrabold text-neutral-900">گالری</h2>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {salon.galleryItems.map((g: any) => (
                  <div key={g.id} className="group relative aspect-square overflow-hidden rounded-3xl bg-neutral-100 shadow-sm">
                    <SafeImage
                      src={g.imageUrl}
                      alt={g.title ?? salon.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                      fallback="🖼️"
                      fallbackClassName="h-full w-full text-4xl"
                    />
                    <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition group-hover:opacity-100">
                      <span className="p-3 text-sm font-bold text-white">{g.title ?? ""}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section id="reviews">
            <div className="flex items-end justify-between">
              <h2 className="text-xl font-extrabold text-neutral-900">نظرات مشتریان</h2>
              {reviewCount > 0 && (
                <span className="text-sm text-neutral-500">
                  میانگین <span className="font-bold text-amber-600">{toPersianDigits(averageRating)}</span> از ۵
                </span>
              )}
            </div>
            {reviews.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400">
                هنوز نظری ثبت نشده است. پس از مراجعه می‌توانید اولین نظر را ثبت کنید.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {reviews.map((r: any) => (
                  <div key={r.id} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-neutral-800">{r.customer.name ?? "مشتری"}</div>
                      <div className="text-amber-500">
                        {"★".repeat(r.rating)}
                        <span className="text-neutral-200">{"★".repeat(5 - r.rating)}</span>
                      </div>
                    </div>
                    {r.staff?.name && <div className="text-[11px] text-neutral-400">آرایشگر: {r.staff.name}</div>}
                    {r.comment && <p className="mt-2 text-sm leading-relaxed text-neutral-600">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
            {(data.reviewsTotalPages ?? 1) > 1 && (
              <Pagination
                page={reviewsPage}
                totalPages={data.reviewsTotalPages ?? 1}
                total={data.reviewCount}
                onChange={setReviewsPage}
              />
            )}
            <p className="mt-3 text-xs text-neutral-400">
              فقط مشتریانی که نوبت «انجام‌شده» در این سالن دارند می‌توانند نظر ثبت کنند.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-extrabold text-neutral-900">ساعات کاری</h2>
            <ul className="mt-4 space-y-2">
              {salon.openingHours.map((h: any) => (
                <li key={h.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 text-sm dark:bg-neutral-900 dark:border dark:border-neutral-800">
                  <span className="font-medium text-neutral-700 dark:text-neutral-300">{days[h.dayOfWeek]}</span>
                  {h.isClosed ? (
                    <span className="text-red-500">تعطیل</span>
                  ) : (
                    <span className="text-neutral-500" dir="ltr">
                      {toPersianDigits(h.openTime)} — {toPersianDigits(h.closeTime)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Booking widget */}
        <aside className="order-1 lg:order-2 lg:sticky lg:top-6 lg:self-start">
          <SalonBooking
            salonId={salon.id}
            slug={salon.slug}
            timezone={salon.timezone}
            maxAdvanceDays={salon.maxAdvanceDays}
            services={salon.services}
            staff={salon.staff}
            branches={salon.branches}
          />
          {/* کیو‌آر کد صفحهٔ سالن — برای چاپ در ورودی یا استوری اینستاگرام */}
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="mb-1 text-sm font-bold text-neutral-700 dark:text-neutral-300">🔳 کیو‌آر کد سالن</h3>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              این کد را چاپ کنید یا در اینستاگرام بگذارید؛ با اسکن، همین صفحه باز می‌شود.
            </p>
            <SalonQrCard
              slug={salon.slug}
              name={salon.name}
              customDomain={salon.customDomain}
              domainStatus={salon.domainStatus}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}
