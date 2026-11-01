import { Link } from "@/router-shim";
import SalonIcon from "@/components/icons/SalonIcon";


/* ─── داده بخش‌ها ───────────────────────────────────────────────────── */

const toc = [
  { href: "#customer", label: "راهنمای مشتریان", icon: "🌸" },
  { href: "#owner", label: "راهنمای سالن‌داران", icon: "✂️" },
  { href: "#agent", label: "راهنمای نمایندگان", icon: "🤝" },
  { href: "#faq", label: "سؤالات متداول", icon: "❓" },
  { href: "#support", label: "پشتیبانی", icon: "🎧" },
];

const customerSteps = [
  {
    icon: "🔍",
    title: "سالن موردنظر را پیدا کنید",
    desc: "از صفحه «جستجوی آرایشگاه‌ها» بر اساس شهر یا نام سالن جست‌وجو کنید. هر سالن یک صفحه اختصاصی با خدمات، قیمت‌ها، گالری و نظرات واقعی مشتریان دارد.",
  },
  {
    icon: "🎙️",
    title: "با صدا نوبت بگیرید",
    desc: "در صفحه سالن دکمه میکروفون را نگه دارید و با فارسی روان بگویید: «برای فردا ساعت ۱۰ کوتاهی مو می‌خواهم؛ نامم سارا و شماره‌ام ۰۹۱۲... است». هوش مصنوعی گفتار را به متن تبدیل می‌کند، مشخصات را جدا می‌کند و نوبت را ثبت می‌کند.",
  },
  {
    icon: "📅",
    title: "یا به‌صورت آنلاین رزرو کنید",
    desc: "خدمت، آرایشگر و شعبه را انتخاب کنید؛ تقویم فقط زمان‌های واقعاً آزاد را نشان می‌دهد و امکان رزرو هم‌زمان وجود ندارد.",
  },
  {
    icon: "📲",
    title: "تأیید و یادآوری پیامکی بگیرید",
    desc: "بلافاصله پیامک تأیید دریافت می‌کنید و ۲۴ ساعت و ۲ ساعت قبل از نوبت، یادآوری خودکار برایتان ارسال می‌شود.",
  },
  {
    icon: "🔄",
    title: "تغییر یا لغو نوبت",
    desc: "از طریق پیامک‌های ارسالی یا تماس با سالن، نوبت را جابه‌جا یا لغو کنید. لغو به‌موقع باعث می‌شود زمان برای مشتری دیگری آزاد شود.",
  },
  {
    icon: "🎁",
    title: "امتیاز، کارت هدیه و نظر",
    desc: "با هر نوبت امتیاز وفاداری جمع می‌کنید، می‌توانید کارت هدیه بخرید یا هدیه بگیرید و بعد از خدمات، نظر و امتیاز خود را ثبت کنید تا به دیگران کمک کند.",
  },
];

const ownerSteps = [
  {
    icon: "🏗️",
    title: "سالن خود را بسازید",
    desc: "بعد از ورود، از داشبورد «ساخت سالن» را بزنید؛ نام، شهر، آدرس، تلفن و رنگ اختصاصی را وارد کنید. بعد از تأیید، صفحه عمومی شما در آدرس nobino.ir/s/نام‌سالن فعال می‌شود.",
  },
  {
    icon: "💇‍♀️",
    title: "خدمات، کارکنان و شعبه‌ها را کامل کنید",
    desc: "برای هر خدمت، مدت‌زمان و قیمت را ثبت کنید؛ کارکنان را با نام، تخصص و عکس اضافه کنید و در پلن سازمانی چند شعبه با برنامه مستقل بسازید.",
  },
  {
    icon: "📋",
    title: "برنامه روزانه را مدیریت کنید",
    desc: "در داشبورد «برنامه امروز»، نوبت‌های هر ساعت را با وضعیت هر مشتری ببینید. اگر پیامک یادآوری برای نوبتی ارسال نشده باشد، همان‌جا هشدار می‌بینید.",
  },
  {
    icon: "🎤",
    title: "ثبت نوبت صوتی و دستی",
    desc: "برای مشتریانی که تلفنی یا از دایرکت اینستاگرام رزرو می‌کنند، از «ثبت نوبت با صوت» استفاده کنید: صدا را ضبط کنید تا هوش مصنوعی نام، شماره، خدمت و ساعت را خودکار استخراج و ثبت کند.",
  },
  {
    icon: "💰",
    title: "صندوق، کیف پول و گزارش مالی",
    desc: "پیش‌پرداخت هر مشتری را در صندوق روزانه ثبت کنید؛ درآمد ماهانه، ساعات پرتقاضا و بهره‌وری هر کارمند را در نمودارهای تحلیلی ببینید.",
  },
  {
    icon: "🧾",
    title: "فاکتور آنلاین برای مشتری",
    desc: "برای خدمت‌ها فاکتور بسازید؛ پیامک پرداخت با لینک امن برای مشتری ارسال می‌شود و او با درگاه بانکی دلخواهش پرداخت می‌کند.",
  },
  {
    icon: "📣",
    title: "کمپین و پیامک مناسبتی",
    desc: "برای مناسبت‌ها (عید، تخفیف، جابه‌جایی سالن و...) از قالب‌های آماده پیامک استفاده کنید و به‌صورت گروهی برای مشتریان ارسال کنید.",
  },
  {
    icon: "🌐",
    title: "دامنه اختصاصی و تصاویر",
    desc: "لوگو و تصویر سربرگ سالن را آپلود کنید، گالری آثار را پر کنید و در صورت تمایل دامنه اختصاصی خودتان را به صفحه سالن وصل کنید.",
  },
  {
    icon: "📍",
    title: "موقعیت روی نقشه",
    desc: "در «تنظیمات سالن» آدرس دقیق را وارد کنید؛ برای نشانگر، مختصات جغرافیایی (lat/lng) را از گوگل‌مپ کپی کنید یا لینک مستقیم نقشه (گوگل/بلد/نشان) بدهید. پیش‌نمایش زنده، نتیجه را نشان می‌دهد و صفحه عمومی شما همان موقعیت را به مشتری نمایش می‌دهد.",
  },
];

const salonGuideSteps = [
  {
    title: "ورود و شروع",
    desc: "با شماره موبایل وارد پنل شوید و در داشبورد روی «سالن من» بزنید؛ اگر سالنی ندارید، فرم ساخت سالن همان‌جا باز می‌شود.",
  },
  {
    title: "اطلاعات اصلی",
    desc: "نام سالن، اسلاگ (آدرس انگلیسی صفحه مثل my-salon)، تلفن، شهر و آدرس کامل را وارد کنید.",
  },
  {
    title: "راه‌های ارتباطی و رنگ",
    desc: "ایمیل، واتساپ، وب‌سایت و اینستاگرام را اضافه کنید و رنگ زمینهٔ صفحه را انتخاب یا با دکمهٔ «رنگ تصادفی» تعیین کنید.",
  },
  {
    title: "لینک بلد و نشان",
    desc: "سالن را در balad.ir یا neshan.org جستجو کنید و از منوی «اشتراک‌گذاری»، لینک را کپی و در فیلد مربوط بگذارید. اگر لینک ندارید، مختصات lat/lng را از گوگل‌مپ کپی کنید تا دکمه‌های نقشه به‌صورت خودکار ساخته شوند.",
  },
  {
    title: "تکمیل و انتشار",
    desc: "خدمات، کارکنان، ساعات کاری، گالری و قوانین رزرو را از «تنظیمات سالن» کامل کنید؛ بعد از تأیید، صفحهٔ عمومی سالن در آدرس اختصاصی فعال می‌شود.",
  },
];

const agentSteps = [
  {
    icon: "🔗",
    title: "سالن معرفی کنید",
    desc: "نمایندگان فروش، سالن‌ها را به نوبینو معرفی می‌کنند و برای هر سالن قرارداد کمیسیون درصدی تنظیم می‌شود.",
  },
  {
    icon: "📈",
    title: "کمیسیون خودکار",
    desc: "درآمد هر سالن معرفی‌شده به‌صورت خودکار محاسبه و سهم نماینده در کیف پول او ثبت می‌شود؛ بدون محاسبه دستی.",
  },
  {
    icon: "💳",
    title: "تسویه شفاف",
    desc: "از پنل نماینده، صورت‌حساب کامل کمیسیون هر سالن و هر دوره قابل مشاهده و تسویه است.",
  },
];

const faqs = [
  {
    q: "چطور اولین سالن را بسازم؟",
    a: "وارد حساب شوید؛ در داشبورد دکمه «ساخت سالن» را بزنید و فرم را پر کنید. سالن بعد از تأیید ادمین، عمومی می‌شود و آدرس اختصاصی می‌گیرد. تا قبل از تأیید می‌توانید همه بخش‌ها را کامل کنید.",
  },
  {
    q: "رزرو صوتی چطور کار می‌کند؟",
    a: "مشتری دکمه میکروفون را نگه می‌دارد و صحبت می‌کند. مرحله اول گفتار به متن تبدیل می‌شود (STT با چند سرویس جایگزین: Groq، HuggingFace، Cloudflare، Deepgram و OpenAI). مرحله دوم یک هوش مصنوعی دیگر نام، شماره، خدمت و تاریخ/ساعت را استخراج می‌کند و خروجی JSON در دیتابیس ذخیره می‌شود و هم‌زمان به مدیر سالن یا رزروکننده نمایش داده می‌شود.",
  },
  {
    q: "اگر پیامک یادآوری ارسال نشود چه اتفاقی می‌افتد؟",
    a: "پیامک‌ها در صف اعلان با شناسه یکتا ذخیره می‌شوند؛ یعنی پیام تکراری ارسال نمی‌شود و در صورت خطا از سرویس‌دهنده بعدی تلاش مجدد می‌شود. در داشبورد سالن‌دار، بخش «برنامه امروز» وضعیت یادآوری هر نوبت را نشان می‌دهد و اگر پیامکی ارسال نشده باشد، هشدار می‌گیرید.",
  },
  {
    q: "امنیت ورود مدیر چطور است؟",
    a: "ورود مدیر (سوپرادمین) دومرحله‌ای است: اول کد تأیید پیامکی، بعد رمز عبور. رمز با scrypt هش می‌شود و بعد از ۱۰ تلاش ناموفق، ورود موقتاً مسدود می‌شود. سایر کاربران می‌توانند با کد پیامکی یا ایمیل (جیمیل و...) وارد شوند.",
  },
  {
    q: "رزرو هم‌زمان دو نفر چطور جلوگیری می‌شود؟",
    a: "تمام ثبت‌ها داخل تراکنش دیتابیس با قفل ردیف سالن (FOR UPDATE) انجام می‌شود؛ یعنی اگر دو مشتری دقیقاً هم‌زمان یک ساعت را انتخاب کنند، فقط اولی موفق می‌شود و دومی پیام «زمان گرفته شد» می‌بیند.",
  },
  {
    q: "پرداخت فاکتور آنلاین چطور انجام می‌شود؟",
    a: "سالن‌دار از پنل، فاکتور با مبلغ و شرح می‌سازد؛ لینک پرداخت پیامک می‌شود؛ مشتری از بین بیش از ۲۰ درگاه بانکی (زرین‌پال، ملت، سامان و...) انتخاب و پرداخت می‌کند و وضعیت فاکتور در هر دو طرف به‌روز می‌شود.",
  },
  {
    q: "چطور عکس کارکنان و سالن را آپلود کنم؟",
    a: "در بخش کارکنان، روی هر آرایشگر دکمه آپلود عکس را بزنید (فرمت‌های JPG/PNG/WebP). برای سالن هم لوگو و تصویر سربرگ از بخش «تنظیمات سالن» قابل آپلود است؛ گالری آثار هم عکس می‌پذیرد.",
  },
  {
    q: "آیا نوبینو اپلیکیشن موبایل دارد؟",
    a: "نوبینو یک وب‌اپ کامل (PWA) است؛ یعنی از منوی مرورگر «افزودن به صفحه اصلی» را بزنید تا مثل اپلیکیشن نصب شود، آیکون اختصاصی داشته باشد و حتی بدون اینترنت صفحه اصلی باز شود. بدون نیاز به نصب از استور.",
  },
  {
    q: "چطور از دوره آزمایشی استفاده کنم؟",
    a: "سالن جدید به‌صورت خودکار دوره آزمایشی دارد. بعد از پایان، برای ادامه از صفحه «پکیج‌ها» پلن پایه، حرفه‌ای یا سازمانی را انتخاب و پرداخت کنید. با پلن رایگان هم امکانات پایه فعال می‌ماند.",
  },
  {
    q: "داده‌ها کجا ذخیره می‌شوند؟",
    a: "همه داده‌ها در PostgreSQL روی زیرساخت امن ذخیره می‌شوند؛ رمزها هش‌شده‌اند، کلیدهای API هرگز در پاسخ‌ها برنمی‌گردند و دسترسی هر نقش فقط به بخش‌های مجاز خودش است.",
  },
  {
    q: "چطور موقعیت سالنم را روی نقشه تنظیم کنم؟",
    a: "از داشبورد → «تنظیمات سالن» آدرس دقیق را وارد کنید. برای نشانگر، مختصات جغرافیایی (lat/lng) را از گوگل‌مپ کپی و در فیلدهای «عرض/طول جغرافیایی» بگذارید؛ یا لینک مستقیم نقشه (گوگل / بلد / نشان) را ارائه کنید. پیش‌نمایش زنده در همان بخش، نتیجه را نشان می‌دهد.",
  },
];

/* ─── کامپوننت‌های کوچک صفحه ───────────────────────────────────────── */

function SectionTitle({ icon, kicker, title, desc }: { icon: string; kicker: string; title: string; desc: string }) {
  return (
    <div className="text-center">
      <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-pink-600 shadow-sm dark:bg-neutral-900 dark:text-pink-300">
        <span>{icon}</span> {kicker}
      </span>
      <h2 className="mt-4 text-2xl font-black text-neutral-900 dark:text-neutral-100 sm:text-3xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl leading-relaxed text-neutral-500 dark:text-neutral-400">{desc}</p>
    </div>
  );
}

export default function HelpPage() {
  return (
    <main className="flex-1 overflow-hidden">
      {/* هدر راهنما */}
      <section className="relative overflow-hidden bg-gradient-to-bl from-pink-600 via-rose-600 to-purple-700 py-16 text-white sm:py-20">
        <div className="absolute inset-0 bg-hero-pattern" />
        <div className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-bold backdrop-blur">
            <SalonIcon className="h-4 w-4" /> مرکز راهنما
          </span>
          <h1 className="mt-5 text-3xl font-black sm:text-5xl">همه‌چیز درباره نوبینو</h1>
          <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-rose-100/90">
            آموزش قدم‌به‌قدم برای مشتریان، سالن‌داران و نمایندگان؛ از اولین رزرو صوتی تا فاکتور آنلاین و کمپین پیامکی.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {toc.map((t) => (
              <a
                key={t.href}
                href={t.href}
                className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur transition hover:bg-white/25"
              >
                {t.icon} {t.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* راهنمای مشتریان */}
      <section id="customer" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-16">
        <SectionTitle
          icon="🌸"
          kicker="مشتریان"
          title="راهنمای رزرو نوبت"
          desc="از پیدا کردن سالن تا دریافت یادآوری پیامکی — هر آنچه یک مشتری باید بداند."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {customerSteps.map((s, i) => (
            <div key={s.title} className="card-hover rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-100 to-purple-100 text-xl dark:from-pink-900/40 dark:to-purple-900/40">
                  {s.icon}
                </span>
                <span className="text-3xl font-black text-neutral-100 dark:text-neutral-800">{i + 1}</span>
              </div>
              <h3 className="mt-4 font-extrabold text-neutral-900 dark:text-neutral-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* راهنمای سالن‌داران */}
      <section id="owner" className="scroll-mt-24 bg-gradient-to-b from-purple-50/60 to-white py-16 dark:from-neutral-900 dark:to-neutral-950">
        <div className="mx-auto max-w-7xl px-6">
          <SectionTitle
            icon="✂️"
            kicker="سالن‌داران"
            title="راهنمای مدیریت سالن"
            desc="از ساخت صفحه سالن تا فاکتور آنلاین، کمپین پیامکی و گزارش‌های تحلیلی."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ownerSteps.map((s, i) => (
              <div key={s.title} className="relative rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <span className="absolute left-5 top-5 text-2xl font-black text-purple-100 dark:text-purple-950">{i + 1}</span>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 text-xl dark:from-purple-900/40 dark:to-pink-900/40">
                  {s.icon}
                </span>
                <h3 className="mt-4 font-extrabold text-neutral-900 dark:text-neutral-100">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{s.desc}</p>
              </div>
            ))}
          </div>
          {/* آموزش گام‌به‌گام ساخت سالن */}
          <div className="mt-10 rounded-[2rem] border border-purple-100 bg-white/70 p-6 shadow-sm backdrop-blur sm:p-8 dark:border-purple-900/40 dark:bg-neutral-900/60">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="lg:w-1/3">
                <h3 className="text-lg font-black text-neutral-900 dark:text-neutral-100">آموزش گام‌به‌گام ساخت سالن</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                  فرم ساخت سالن همهٔ اطلاعات لازم را همان ابتدا می‌پرسد: راه‌های ارتباطی، رنگ صفحه و لینک نقشهٔ بلد/نشان. این
                  راهنما قدم‌به‌قدم شما را تا انتشار صفحهٔ عمومی همراهی می‌کند.
                </p>
                <Link
                  href="/dashboard/salon?new=1"
                  className="mt-5 inline-flex h-11 items-center rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 px-6 text-sm font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.03]"
                >
                  🚀 همین حالا سالن بسازید
                </Link>
              </div>
              <ol className="flex-1 space-y-3">
                {salonGuideSteps.map((s, i) => (
                  <li key={s.title} className="flex gap-3 rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 text-sm font-black text-purple-700 dark:from-purple-900/40 dark:to-pink-900/40 dark:text-purple-300">
                      {i + 1}
                    </span>
                    <div>
                      <h4 className="font-extrabold text-neutral-900 dark:text-neutral-100">{s.title}</h4>
                      <p className="mt-1 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/login" className="rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.03]">
              ورود به پنل سالن‌دار
            </Link>
            <Link href="/packages" className="rounded-2xl border border-neutral-300 bg-white px-6 py-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
              مقایسه پلن‌ها
            </Link>
          </div>
        </div>
      </section>

      {/* راهنمای نمایندگان */}
      <section id="agent" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-16">
        <SectionTitle
          icon="🤝"
          kicker="نمایندگان فروش"
          title="کمیسیون شفاف و خودکار"
          desc="نمایندگان، سالن‌ها را معرفی می‌کنند و از درآمد آن‌ها کمیسیون می‌گیرند."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {agentSteps.map((s, i) => (
            <div key={s.title} className="rounded-3xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 text-2xl dark:from-emerald-900/40 dark:to-teal-900/40">
                {s.icon}
              </div>
              <div className="mt-3 text-xs font-black text-emerald-600 dark:text-emerald-400">قدم {i + 1}</div>
              <h3 className="mt-1 font-extrabold text-neutral-900 dark:text-neutral-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* سؤالات متداول */}
      <section id="faq" className="scroll-mt-24 bg-gradient-to-b from-pink-50/50 to-white py-16 dark:from-neutral-900 dark:to-neutral-950">
        <div className="mx-auto max-w-4xl px-6">
          <SectionTitle
            icon="❓"
            kicker="پاسخ سریع"
            title="سؤالات متداول"
            desc="پاسخ کامل‌ترین پرسش‌های مشتریان و سالن‌داران درباره نوبینو."
          />
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
        </div>
      </section>

      {/* پشتیبانی */}
      <section id="support" className="mx-auto max-w-7xl scroll-mt-24 px-6 pb-20">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-bl from-pink-600 via-rose-600 to-purple-700 px-8 py-14 text-center text-white shadow-2xl shadow-pink-500/30">
          <div className="absolute inset-0 bg-hero-pattern" />
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <h2 className="text-2xl font-black sm:text-3xl">هنوز سؤالی دارید؟</h2>
            <p className="mx-auto mt-3 max-w-lg text-rose-100/90">
              تیم پشتیبانی فارسی‌زبان نوبینو آماده پاسخ‌گویی است. از داخل پنل، بخش «پشتیبانی» تیکت ثبت کنید یا ایمیل بزنید.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-4">
              <Link href="/login" className="rounded-2xl bg-white px-7 py-3.5 font-black text-rose-600 shadow-xl transition hover:scale-105">
                ثبت تیکت پشتیبانی
              </Link>
              <a href="mailto:support@nobino.ir" className="rounded-2xl border border-white/40 bg-white/10 px-7 py-3.5 font-bold backdrop-blur transition hover:bg-white/20" dir="ltr">
                support@nobino.ir
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
