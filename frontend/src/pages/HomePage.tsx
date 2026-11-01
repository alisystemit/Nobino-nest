/**
 * صفحهٔ نخست نوبینو.
 * دیتای زنده (سالن‌ها، آمار، پکیج‌ها) از لودر /api/pages/home می‌آید؛
 * بخش‌های استاتیک عیناً همان JSX اصلی هستند.
 */
import { Link } from "@/router-shim";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import HomeHero from "@/components/HomeHero";
import SafeImage from "@/components/SafeImage";
import SalonIcon from "@/components/icons/SalonIcon";
import { formatToman, toPersianDigits } from "@/lib/utils";
import { subdomainUrl } from "@/lib/subdomain";
import { usePageData } from "@/lib/page-data";

type HomeData = {
  salons: {
    id: string;
    slug: string;
    name: string;
    city: string | null;
    address: string | null;
    description: string | null;
    coverColor: string | null;
    bannerUrl: string | null;
    services: { name: string; price: number }[];
  }[];
  ratingMap: Record<string, { avg: number | null; count: number }>;
  stats: {
    activeSalons: number;
    totalAppointments: number;
    customerCount: number;
    avgRating: number | null;
    reviewCount: number;
  };
  packages: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    featureList: { key?: string; label: string; icon: string }[];
  }[];
};

const features = [
  { icon: "🎙️", title: "نوبت‌دهی صوتی", desc: "مشتری با میکروفون به فارسی نوبت می‌گیرد؛ هوش مصنوعی گفتار را به متن تبدیل و ثبت می‌کند.", grad: "from-pink-500 to-rose-500" },
  { icon: "📲", title: "پیامک یادآوری", desc: "تأیید، یادآوری ۲۴ و ۲ ساعت قبل و اطلاع‌رسانی تغییرات؛ همه از صف مطمئن پیامک.", grad: "from-purple-500 to-indigo-500" },
  { icon: "salon", title: "صفحه و دامنه مجزا", desc: "هر آرایشگاه یک صفحه اختصاصی با گالری، خدمات، نظرات و دکمه رزرو آنلاین دارد.", grad: "from-emerald-500 to-teal-500" },
  { icon: "💳", title: "مدیریت مالی دقیق", desc: "کیف پول، کمیسیون درصدی نمایندگان، صندوق روزانه و گزارش مالی شفاف.", grad: "from-amber-500 to-orange-500" },
  { icon: "🏦", title: "۲۰ درگاه پرداخت", desc: "مشتری درگاه دلخواهش را انتخاب می‌کند؛ زرین‌پال، ملت، سامان و ده‌ها درگاه دیگر.", grad: "from-sky-500 to-blue-500" },
  { icon: "🧠", title: "دستیار هوشمند", desc: "پاسخ به سوالات متداول از اطلاعات تأییدشده همان سالن و پیشنهاد زمان آزاد.", grad: "from-fuchsia-500 to-pink-500" },
  { icon: "🏢", title: "چند شعبه", desc: "مدیریت چند شعبه با کارکنان، صندوق و نوبت‌های مستقل برای هر شعبه.", grad: "from-lime-500 to-green-500" },
  { icon: "📊", title: "گزارش و تحلیل", desc: "نمودار درآمد، نرخ مراجعه مجدد، ساعات پرتقاضا و بهره‌وری کارکنان.", grad: "from-cyan-500 to-sky-500" },
  { icon: "🎁", title: "وفاداری و هدیه", desc: "امتیاز مشتری، کارت هدیه، صف انتظار هوشمند و کمپین‌های بازاریابی.", grad: "from-violet-500 to-purple-500" },
];

const steps = [
  { icon: "۱", title: "سالن خود را بسازید", desc: "در کمتر از یک دقیقه صفحه اختصاصی سالن را با خدمات، کارکنان و شعبه‌ها راه‌اندازی کنید." },
  { icon: "۲", title: "مشتری با صدا نوبت می‌گیرد", desc: "مشتری با میکروفون فارسی نوبت می‌گیرد یا از دکمه رزرو آنلاین استفاده می‌کند؛ سیستم همه‌چیز را خودکار ثبت می‌کند." },
  { icon: "۳", title: "یادآوری و مدیریت", desc: "پیامک یادآوری خودکار، تقویم و برنامه روزانه، گزارش مالی و تحلیل عملکرد در دسترس شماست." },
];

const testimonials = [
  { name: "نگار رضایی", role: "مدیر سالن زیبایی ماه", text: "با نوبینو وقت‌های خالی سالن پر شد و مشتری‌ها از رزرو صوتی لذت می‌برند.", avatar: "✂️", stars: 5 },
  { name: "امیر محمدی", role: "نماینده فروش", text: "کمیسیون و تسویه کاملاً خودکار و شفاف است؛ همه‌چیز در یک پنل.", avatar: "🤝", stars: 5 },
  { name: "سارا احمدی", role: "مشتری", text: "خیلی راحت با صدا نوبت گرفتم و پیامک یادآوری هم گرفتم. عالی بود!", avatar: "🌸", stars: 5 },
  { name: "الهام صادقی", role: "مشتری ثابت", text: "از وقتی سالن روی نوبینو آمده، دیگه پشت خط تلفن نمی‌مانم؛ آنلاین و صوتی نوبت می‌گیرم.", avatar: "💇‍♀️", stars: 5 },
  { name: "مریم رستمی", role: "مدیر سالن نیلوفر", text: "گزارش‌های مالی و نمودارهای پنل دقیقاً همان چیزی بود که برای مدیریت شعبه‌ها لازم داشتم.", avatar: "📊", stars: 4 },
  { name: "رضا قاسمی", role: "مدیر سالن بهار", text: "فاکتور آنلاین و پیامک کمپین مشتری‌های قدیمی را برگرداند. پشتیبانی هم عالی است.", avatar: "💼", stars: 5 },
];

const faqs = [
  { q: "آیا برای شروع به کارت بانکی نیاز دارم؟", a: "نه. می‌توانید با پلن رایگان شروع کنید و هر زمان که خواستید به پلن‌های پایه، حرفه‌ای یا سازمانی ارتقا دهید." },
  { q: "رزرو هم‌زمان دو مشتری چطور مدیریت می‌شود؟", a: "همه نوبت‌ها داخل تراکنش دیتابیس و با قفل ردیف سالن ثبت می‌شوند؛ بنابراین حتی اگر دو نفر هم‌زمان همان زمان را انتخاب کنند، فقط یکی موفق می‌شود." },
  { q: "آیا صفحه سالن در گوگل دیده می‌شود؟", a: "بله. هر صفحه سالن دارای متادیتای اختصاصی، داده ساختاریافته HairSalon و نقشه سایت است تا در نتایج جست‌وجو بهتر دیده شود." },
  { q: "اگر سرویس پیامک قطع شود چه می‌شود؟", a: "پیام‌ها در صف ذخیره می‌شوند و به‌صورت خودکار از سرویس‌دهنده بعدیِ پیکربندی‌شده تلاش مجدد می‌شود؛ هیچ اعلانی گم نمی‌شود." },
  { q: "می‌توانم چند شعبه داشته باشم؟", a: "بله. تعداد شعبه‌ها و کارکنان بر اساس پلن شما تعیین می‌شود و از پنل مدیریت قابل ارتقاست." },
];

function joinLocation(city: string | null | undefined, address: string | null | undefined): string {
  const c = (city ?? "").trim();
  const a = (address ?? "").trim();
  if (!c) return a || "—";
  if (!a) return c;
  const a2 = (a.startsWith(c + "،") ? a.slice(c.length + 1) : a.startsWith(c + ",") ? a.slice(c.length + 1) : a).trim();
  return a2 ? `${c} — ${a2}` : c;
}

export default function HomePage() {
  const { data } = usePageData<HomeData>("home");
  const salons = data?.salons ?? [];
  const ratingMap = data?.ratingMap ?? {};
  const stats = data?.stats;
  const packages = data?.packages ?? [];

  return (
    <main className="flex-1 overflow-hidden">
      <AnnouncementBanner />
      <HomeHero />

      {/* نوار اعتماد */}
      <section className="border-y border-neutral-200 bg-white/70 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/60">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-6 py-6 sm:grid-cols-4">
          {[
            ["۲۴/۷", "رزرو آنلاین و صوتی"],
            ["۱۰۰٪", "ضد رزرو هم‌زمان"],
            ["+۲۰", "درگاه پرداخت ایرانی"],
            ["۱۰", "سرویس پیامک با fallback"],
          ].map(([v, l]) => (
            <div key={l} className="text-center">
              <div className="text-xl font-black text-pink-600 sm:text-2xl font-rakh">{v}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500 sm:text-xs">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* آمار زنده پلتفرم */}
      <section className="mx-auto max-w-7xl px-6 pt-14">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-l from-[#1c2434] via-[#232c40] to-[#2a3450] px-6 py-8 text-white shadow-xl sm:px-10">
          <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-pink-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-purple-500/20 blur-3xl" />
          <div className="relative grid grid-cols-2 gap-6 lg:grid-cols-4">
            {[
              { v: toPersianDigits(stats?.activeSalons ?? "—"), l: "سالن فعال روی نوبینو", s: "🏢" },
              { v: toPersianDigits(stats?.totalAppointments ?? "—"), l: "نوبت ثبت‌شده تا امروز", s: "📋" },
              { v: toPersianDigits(stats?.customerCount ?? "—"), l: "مشتری ثبت‌نام‌کرده", s: "👥" },
              { v: stats?.avgRating ? toPersianDigits(stats.avgRating.toFixed(1)) : "۴٫۷", l: `میانگین امتیاز از ${toPersianDigits(stats?.reviewCount ?? 0)} نظر`, s: "⭐" },
            ].map((x) => (
              <div key={x.l} className="text-center">
                <div className="text-2xl">{x.s}</div>
                <div className="mt-2 text-2xl font-black sm:text-3xl font-plak">{x.v}</div>
                <div className="mt-1 text-[11px] text-white/60 sm:text-xs">{x.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* سالن نمونه */}
      {salons.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="inline-block rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">روی نوبینو</span>
              <h2 className="mt-3 text-3xl font-black text-neutral-900 dark:text-neutral-100">سالن نمونه نوبینو</h2>
            </div>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {salons.map((s) => {
              const r = ratingMap[s.id];
              return (
                <Link key={s.id} href={subdomainUrl(s.slug)} className="group overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${s.coverColor}, #7c3aed)` }}>
                    <SafeImage src={s.bannerUrl ?? "/seed/hero.svg"} alt={s.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" fallback={<SalonIcon className="h-10 w-10 opacity-60" />} fallbackClassName="absolute inset-0 !bg-transparent" />
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-neutral-700 backdrop-blur">📍 {s.city ?? "سالن زیبایی"}</span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">{s.name}</h3>
                      {r?.avg != null && (
                        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          ★ {toPersianDigits(r.avg.toFixed(1))} ({toPersianDigits(r.count)})
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">📍 {joinLocation(s.city, s.address)}</p>
                    {s.description && <p className="mt-2 line-clamp-2 text-sm text-neutral-400 dark:text-neutral-500">{s.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.services.map((svc) => (
                        <span key={svc.name} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          {svc.name} · {formatToman(svc.price)}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ویژگی‌ها */}
      <section className="relative mx-auto max-w-7xl px-6 py-20">
        <div className="pointer-events-none absolute -right-32 top-10 h-72 w-72 rounded-full bg-pink-200/30 blur-3xl dark:bg-pink-900/20" />
        <div className="pointer-events-none absolute -left-32 bottom-10 h-72 w-72 rounded-full bg-purple-200/30 blur-3xl dark:bg-purple-900/20" />
        <div className="relative text-center">
          <span className="inline-block rounded-full bg-pink-50 px-4 py-1.5 text-sm font-bold text-pink-600 dark:bg-pink-900/30 dark:text-pink-300">امکانات</span>
          <h2 className="mt-4 text-3xl font-black text-neutral-900 dark:text-neutral-100 sm:text-4xl">هر آنچه یک آرایشگاه نیاز دارد</h2>
          <p className="mx-auto mt-3 max-w-xl text-neutral-500 dark:text-neutral-400">یک پلتفرم کامل برای نوبت، مشتری، امور مالی و رشد کسب‌وکار شما.</p>
        </div>

        <div className="relative mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group card-hover relative overflow-hidden rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${f.grad} opacity-10 transition group-hover:scale-150`} />
              <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${f.grad} text-2xl text-white shadow-lg`}>
                {f.icon === "salon" ? <SalonIcon className="h-7 w-7" /> : f.icon}
              </div>
              <h3 className="relative mt-5 text-lg font-extrabold text-neutral-900 dark:text-neutral-100">{f.title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* دموی رزرو صوتی */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full bg-pink-50 px-4 py-1.5 text-sm font-bold text-pink-600 dark:bg-pink-900/30 dark:text-pink-300">🎙️ هوش مصنوعی صوتی</span>
            <h2 className="mt-4 text-3xl font-black leading-tight text-neutral-900 dark:text-neutral-100 sm:text-4xl">
              مشتری حرف می‌زند، <span className="text-gradient">سیستم نوبت می‌گیرد</span>
            </h2>
            <p className="mt-4 leading-relaxed text-neutral-600 dark:text-neutral-300">
              مشتری با صدای فارسی می‌گوید چه روزی برای چه خدمتی می‌خواهد؛ گفتار به متن تبدیل می‌شود،
              ربات دوم اطلاعات را به‌صورت JSON جدا می‌کند و نوبت مستقیماً در دیتابیس ثبت و هم‌زمان به مدیر سالن نمایش داده می‌شود.
            </p>
            <div className="mt-6 space-y-3">
              {[
                ["۱", "مشتری متن نمونه را با مشخصات خودش می‌خواند"],
                ["۲", "گفتار فارسی به متن تبدیل می‌شود (چند سرویس با پشتیبان خودکار)"],
                ["۳", "ربات دوم نام، شماره، خدمت، تاریخ و ساعت را جدا می‌کند"],
                ["۴", "اگر بخشی نامفهوم بود فقط همان را دوباره می‌پرسد"],
                ["۵", "خروجی JSON در دیتابیس ثبت و هم‌زمان به سالن‌دار نشان داده می‌شود"],
              ].map(([n, t]) => (
                <div key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-xs font-black text-white shadow-md shadow-pink-500/25">{n}</span>
                  <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{t}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-pink-300/30 to-purple-300/30 blur-2xl" />
            <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-2xl shadow-pink-500/10 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="border-b border-neutral-100 bg-gradient-to-l from-pink-50 to-purple-50 px-5 py-3.5 dark:border-neutral-800 dark:from-neutral-900 dark:to-neutral-900">
                <span className="text-xs font-black text-pink-700 dark:text-pink-300">متن نمونه برای مشتری — مشخصات را عوض کنید</span>
              </div>
              <div className="space-y-3 p-5">
                <div className="rounded-2xl rounded-tr-sm bg-pink-50 px-4 py-3 text-sm leading-relaxed text-neutral-700 dark:bg-pink-950/30 dark:text-neutral-200">
                  «سلام، می‌خوام نوبت رزرو کنم: برای فردا ساعت ده صبح، خدمت کوتاهی مو، به نام سارا احمدی، شماره موبایل ۰۹۱۲۳۴۵۶۷۸۹»
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-neutral-400">
                  <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" /> تبدیل و استخراج هوش مصنوعی <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    ["نام", "سارا احمدی", "bg-emerald-50 text-emerald-700"],
                    ["شماره", "۰۹۱۲۳۴۵۶۷۸۹", "bg-emerald-50 text-emerald-700"],
                    ["خدمت", "کوتاهی مو", "bg-emerald-50 text-emerald-700"],
                    ["تاریخ", "فردا", "bg-emerald-50 text-emerald-700"],
                    ["ساعت", "۱۰:۰۰", "bg-emerald-50 text-emerald-700"],
                    ["وضعیت", "ثبت در دیتابیس ✓", "bg-purple-50 text-purple-700"],
                  ].map(([k, v, cls]) => (
                    <div key={k} className={`rounded-xl px-3 py-2 font-bold ${cls}`}>
                      {k}: {v}
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl rounded-tr-sm bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                  🤖 اگر مثلاً یک رقمِ شماره را نفهمیدم، زیر متن فقط می‌پرسم: «شماره موبایل را دوباره بگویید» — و فقط همان را ضبط می‌کنید.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* پیش‌نمایش داشبورد */}
      <section className="bg-gradient-to-b from-purple-50/70 to-white py-20 dark:from-neutral-900 dark:to-neutral-950">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <span className="inline-block rounded-full bg-purple-100 px-4 py-1.5 text-sm font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">پنل مدیریت</span>
            <h2 className="mt-4 text-3xl font-black leading-tight text-neutral-900 dark:text-neutral-100 sm:text-4xl">
              برنامه روزانه‌ای که <span className="text-gradient">سالن را می‌چرخاند</span>
            </h2>
            <p className="mt-4 leading-relaxed text-neutral-600 dark:text-neutral-300">
              برای هر خدمت و هر آرایشگر ببینید چه کسی، چه ساعتی می‌آید، چه مبلغی بیعانه داده و چه زمانی آزاد است.
              ثبت نوبت تلفنی و شبکه‌های اجتماعی هم فقط با چند کلیک انجام می‌شود.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-neutral-600 dark:text-neutral-300">
              {[
                "نمای روزانه، هفتگی و ماهانه با فیلتر آرایشگر، خدمت و وضعیت",
                "پیش‌پرداخت، زمان حضور، پایان و یادداشت هر مشتری",
                "ثبت نوبت دستی برای تماس تلفنی و دایرکت اینستاگرام",
                "گزارش درآمد، لغو، عدم حضور و بهره‌وری کارکنان",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">✓</span>
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/login" className="rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.03]">
                ورود به پنل
              </Link>
              <Link href="https://mah.localhost:5175" className="rounded-2xl border border-neutral-300 bg-white px-6 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
                دیدن صفحه نمونه
              </Link>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-pink-300/30 to-purple-300/30 blur-2xl" />
            <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-purple-500/10 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center gap-1.5 border-b border-neutral-100 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="mr-auto rounded-md bg-white px-2 py-0.5 text-[9px] text-neutral-400 dark:bg-neutral-800">nobino.ir/dashboard</span>
              </div>
              <div className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["نوبت امروز", "۱۲", "📋"],
                    ["درآمد", "۴٫۸ م", "💰"],
                    ["بیعانه", "۹۰۰ هـ", "🧾"],
                  ].map(([l, v, i]) => (
                    <div key={l} className="rounded-xl bg-neutral-50 p-2.5 dark:bg-neutral-800">
                      <div className="text-sm">{i}</div>
                      <div className="mt-1 text-sm font-black text-neutral-800 dark:text-neutral-100">{v}</div>
                      <div className="text-[9px] text-neutral-400">{l}</div>
                    </div>
                  ))}
                </div>
                {[
                  ["۱۰:۳۰", "سارا احمدی", "کوتاهی مو", "تأییدشده", "bg-emerald-50 text-emerald-700"],
                  ["۱۲:۰۰", "مریم کریمی", "رنگ مو", "در انتظار", "bg-amber-50 text-amber-700"],
                  ["۱۴:۳۰", "نگین رضایی", "کاشت ناخن", "انجام‌شده", "bg-sky-50 text-sky-700"],
                ].map(([time, name, svc, st, cls]) => (
                  <div key={time} className="flex items-center justify-between rounded-xl border border-neutral-100 px-3 py-2 dark:border-neutral-800">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-black text-neutral-700 dark:text-neutral-200">{time}</span>
                      <div>
                        <div className="text-[11px] font-bold text-neutral-800 dark:text-neutral-100">{name}</div>
                        <div className="text-[9px] text-neutral-400">{svc}</div>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${cls}`}>{st}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-3 py-2 text-white">
                  <span className="text-[10px] font-bold">ثبت نوبت دستی یا صوتی</span>
                  <span className="text-xs">🎙️ +</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* زیرساخت مطمئن: درگاه‌ها + نصب روی گوشی */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="relative overflow-hidden rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-sky-100/60 blur-2xl dark:bg-sky-900/20" />
            <div className="relative">
              <span className="inline-block rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">💳 پرداخت مطمئن</span>
              <h3 className="mt-3 text-xl font-black text-neutral-900 dark:text-neutral-100">بیش از ۲۰ درگاه پرداخت ایرانی</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                مشتری از درگاه دلخواهش پرداخت می‌کند؛ بیعانه آنلاین، فاکتور پیامکی و تسویه خودکار کیف پول.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["زرین‌پال", "سداد ملت", "سامان", "پارسیان", "آسان‌پرداخت", "به‌پرداخت ملت", "پاسارگاد", "سپهر", "دیجی‌پی", "آیدی‌پی"].map((g) => (
                  <span key={g} className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-bold text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    {g}
                  </span>
                ))}
                <span className="rounded-full bg-gradient-to-l from-pink-600 to-purple-600 px-3 py-1.5 text-[11px] font-black text-white">+۱۰ درگاه دیگر</span>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-bl from-[#1c2434] to-[#2a3450] p-8 text-white shadow-xl">
            <div className="pointer-events-none absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-purple-500/20 blur-2xl" />
            <div className="relative">
              <span className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white backdrop-blur">📲 وب‌اپ کامل (PWA)</span>
              <h3 className="mt-3 text-xl font-black">نوبینو را مثل اپ روی گوشی‌تان نصب کنید</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/70">
                بدون نیاز به فروشگاه اپ — در مرورگر منو را باز کنید و «افزودن به صفحه اصلی» را بزنید؛ آفلاین، سریع و با اعلان.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="rounded-full bg-white/10 px-3 py-1.5">۱. باز کردن منوی مرورگر</span>
                <span className="text-white/40">←</span>
                <span className="rounded-full bg-white/10 px-3 py-1.5">۲. افزودن به صفحه اصلی</span>
                <span className="text-white/40">←</span>
                <span className="rounded-full bg-gradient-to-l from-pink-500 to-purple-500 px-3 py-1.5">۳. تمام! 🎉</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* مراحل */}
      <section className="bg-gradient-to-b from-purple-50/60 to-white py-20 dark:from-neutral-900 dark:to-neutral-950">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <span className="inline-block rounded-full bg-white px-4 py-1.5 text-sm font-bold text-purple-600 shadow-sm dark:bg-neutral-900 dark:text-purple-300">شروع سریع</span>
            <h2 className="mt-4 text-3xl font-black text-neutral-900 dark:text-neutral-100">در ۳ قدم شروع کنید</h2>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.title} className="relative rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 text-2xl font-black text-white shadow-lg shadow-pink-500/30">
                  {s.icon}
                </div>
                <h3 className="mt-5 text-lg font-extrabold text-neutral-900 dark:text-neutral-100">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* پکیج‌ها */}
      {packages.length > 0 && (
        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="text-center">
            <span className="inline-block rounded-full bg-amber-50 px-4 py-1.5 text-sm font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">تعرفه شفاف</span>
            <h2 className="mt-4 text-3xl font-black text-neutral-900 dark:text-neutral-100">پلنی که به اندازه سالن شماست</h2>
            <p className="mx-auto mt-3 max-w-xl text-neutral-500 dark:text-neutral-400">از پلن رایگان شروع کنید و هر زمان خواستید ارتقا دهید. بدون هزینه پنهان.</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {packages.map((p, idx) => {
              const featured = idx === Math.min(1, packages.length - 1);
              const feats = p.featureList;
              return (
                <div key={p.id} className={`relative flex flex-col rounded-3xl border p-7 shadow-sm ${featured ? "border-pink-300 bg-gradient-to-b from-white to-pink-50/60 ring-2 ring-pink-200 dark:border-pink-800 dark:from-neutral-900 dark:to-pink-950/20" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"}`}>
                  {featured && <span className="absolute -top-3 right-6 rounded-full bg-pink-600 px-3 py-1 text-[10px] font-black text-white">پیشنهاد ما</span>}
                  <h3 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">{p.name}</h3>
                  <p className="mt-1 text-xs text-neutral-400">{p.description ?? "برای رشد سالن و مدیریت روزمره"}</p>
                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-2xl font-black text-pink-600">{p.price.toLocaleString("fa-IR")}</span>
                    <span className="mb-1 text-xs text-neutral-400">تومان / ماه</span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
                    {feats.slice(0, 6).map((f) => (
                      <li key={f.key ?? f.label} className="flex items-start gap-2">
                        <span className="text-emerald-500">{f.icon}</span> {f.label}
                      </li>
                    ))}
                  </ul>
                  <Link href="/packages" className={`mt-6 rounded-xl py-3 text-center text-sm font-black transition ${featured ? "bg-pink-600 text-white hover:bg-pink-700" : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100"}`}>
                    انتخاب پلن
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-center text-sm text-neutral-400">
            <Link href="/packages" className="font-bold text-pink-600 hover:underline">مشاهده جدول کامل پکیج‌ها و مقایسه امکانات ←</Link>
          </p>
        </section>
      )}

      {/* نظرات */}
      <section className="bg-gradient-to-b from-pink-50/50 to-white py-20 dark:from-neutral-900 dark:to-neutral-950">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-black text-neutral-900 dark:text-neutral-100">مشتریان چه می‌گویند؟</h2>
            <p className="mt-2 text-neutral-500 dark:text-neutral-400">نظر مدیران سالن‌ها و مشتریانی که از نوبینو استفاده می‌کنند.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="card-hover rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div className="text-yellow-400">
                  {"★".repeat(t.stars)}
                  <span className="text-neutral-200 dark:text-neutral-700">{"★".repeat(5 - t.stars)}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">«{t.text}»</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-pink-100 to-purple-100 text-xl dark:from-pink-900/40 dark:to-purple-900/40">{t.avatar}</div>
                  <div>
                    <div className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">{t.name}</div>
                    <div className="text-xs text-neutral-400">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* سوالات متداول */}
      <section className="mx-auto max-w-4xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-black text-neutral-900 dark:text-neutral-100">سؤالات متداول</h2>
          <p className="mt-2 text-neutral-500 dark:text-neutral-400">اگر پاسخ سؤالتان را پیدا نکردید، از پنل پشتیبانی پیام بدهید.</p>
        </div>
        <div className="mt-8 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold text-neutral-800 dark:text-neutral-100">
                {f.q}
                <span className="text-pink-600 transition group-open:rotate-45">＋</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          پاسخ کامل‌تر همه پرسش‌ها را در{" "}
          <Link href="/help" className="font-bold text-pink-600 hover:underline">مرکز راهنمای نوبینو ←</Link>{" "}
          بخوانید.
        </p>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-bl from-pink-600 via-rose-600 to-purple-700 px-8 py-16 text-center text-white shadow-2xl shadow-pink-500/30">
          <div className="absolute inset-0 bg-hero-pattern" />
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <h2 className="text-3xl font-black sm:text-4xl">آماده‌اید سالن خود را دیجیتال کنید؟</h2>
            <p className="mx-auto mt-3 max-w-lg text-rose-100/90">همین حالا شروع کنید؛ بدون کارت بانکی و با دوره آزمایشی رایگان.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/login" className="rounded-2xl bg-white px-8 py-4 text-base font-black text-rose-600 shadow-xl transition hover:scale-105">
                شروع رایگان 🚀
              </Link>
            </div>
            <p className="mt-6 text-xs text-rose-100/70">پشتیبانی فارسی · راه‌اندازی در چند دقیقه · لغو در هر زمان</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-white"><SalonIcon className="h-5 w-5" /></span>
                <span className="text-lg font-black text-neutral-900 dark:text-neutral-100">نوبینو</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                نوبت‌دهی هوشمند آرایشگاه با هوش مصنوعی صوتی، یادآوری خودکار و مدیریت کامل مالی.
              </p>
            </div>
            <div>
              <div className="text-sm font-extrabold text-neutral-800 dark:text-neutral-200">دسترسی سریع</div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <Link href="/packages" className="hover:text-pink-600">پکیج‌ها و تعرفه</Link>
                <Link href="/help" className="hover:text-pink-600">راهنمای کامل</Link>
                <Link href="/login" className="hover:text-pink-600">ورود / ثبت‌نام</Link>
                <Link href="https://mah.localhost:5175" className="hover:text-pink-600">صفحه نمونه سالن</Link>
              </div>
            </div>
            <div>
              <div className="text-sm font-extrabold text-neutral-800 dark:text-neutral-200">امکانات</div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <span>رزرو آنلاین و صوتی</span>
                <span>پیامک یادآوری</span>
                <span>گزارش مالی و CRM</span>
                <span>پشتیبانی و شکایت</span>
              </div>
            </div>
            <div>
              <div className="text-sm font-extrabold text-neutral-800 dark:text-neutral-200">تماس</div>
              <div className="mt-3 flex flex-col gap-2 text-sm text-neutral-500 dark:text-neutral-400">
                <span>support@nobino.ir</span>
                <span dir="ltr">۰۲۱-۱۲۰۰۰۰۰۰</span>
                <span>تهران، ایران</span>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-neutral-200 pt-6 text-center text-xs text-neutral-400 dark:border-neutral-800 sm:flex-row sm:text-right">
            <span>© ۱۴۰۵ نوبینو — نوبت‌دهی هوشمند آرایشگاه</span>
            <span>ساخته‌شده با ❤️ برای سالن‌های ایرانی</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
