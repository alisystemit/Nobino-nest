"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Lang = "fa" | "en";

const translations: Record<string, { fa: string; en: string }> = {
  "nav.home": { fa: "خانه", en: "Home" },
  "nav.login": { fa: "ورود", en: "Login" },
  "nav.dashboard": { fa: "داشبورد", en: "Dashboard" },
  "nav.packages": { fa: "پکیج‌ها", en: "Packages" },
  "nav.salons": { fa: "جستجوی آرایشگاه‌ها", en: "Find Salons" },
  "nav.help": { fa: "راهنما", en: "Help" },
  "hero.badge": { fa: "هوش مصنوعی صوتی", en: "Voice AI" },
  "hero.title1": { fa: "نوبت‌دهی آرایشگاه", en: "Salon Booking" },
  "hero.title2": { fa: "با صدای فارسی", en: "with Voice" },
  "hero.subtitle": {
    fa: "نوبینو به هر آرایشگاه یک صفحه و ساب‌دامین مجزا می‌دهد؛ مشتری با میکروفون نوبت می‌گیرد، سیستم آن را به متن تبدیل می‌کند و پیامک یادآوری می‌فرستد.",
    en: "Nobino gives each salon its own page and subdomain. Customers book by voice, the system transcribes it, and SMS reminders are sent automatically.",
  },
  "hero.login": { fa: "ورود به پنل", en: "Login to Dashboard" },
  "hero.demo": { fa: "مشاهده سالن نمونه", en: "View Demo Salon" },
  "hero.search": { fa: "جستجوی آرایشگاه‌ها", en: "Search Salons" },
  "home.features": { fa: "هر آنچه یک آرایشگاه نیاز دارد", en: "Everything a Salon Needs" },
  "home.featuresSub": { fa: "یک پلتفرم کامل برای مدیریت نوبت، مشتری و امور مالی", en: "A complete platform for appointments, customers & finance" },
  "footer.copyright": { fa: "© ۱۴۰۴ نوبینو — نوبت‌دهی هوشمند آرایشگاه", en: "© 2026 Nobino — Smart Salon Booking" },
  "announcement": { fa: "به نوبینو خوش آمدید 🎉", en: "Welcome to Nobino 🎉" },

  // پنل مدیریت آرایشگاه / قابلیت‌های جدید
  "manager.tabs.services": { fa: "خدمات", en: "Services" },
  "manager.tabs.calendar": { fa: "تقویم نوبت", en: "Appointments" },
  "manager.tabs.staff": { fa: "کارکنان", en: "Staff" },
  "manager.tabs.customers": { fa: "مشتریان", en: "Customers" },
  "manager.tabs.holidays": { fa: "تعطیلات", en: "Holidays" },
  "manager.tabs.branches": { fa: "شعبه‌ها", en: "Branches" },
  "manager.tabs.cash": { fa: "صندوق", en: "Cash Register" },
  "manager.tabs.report": { fa: "گزارش عملکرد", en: "Performance" },
  "manager.tabs.waitlist": { fa: "صف انتظار", en: "Waitlist" },
  "manager.tabs.blocks": { fa: "مسدودسازی", en: "Time Blocks" },
  "manager.tabs.booking": { fa: "ثبت نوبت", en: "Manual Booking" },
  "manager.tabs.invoices": { fa: "فاکتورها", en: "Invoices" },
  "manager.tabs.campaigns": { fa: "کمپین", en: "Campaigns" },
  "manager.tabs.domain": { fa: "دامنه", en: "Custom Domain" },
  "manager.tabs.data": { fa: "خروجی/ورود داده", en: "Export / Import" },

  "invoices.title": { fa: "فاکتورها و رسیدهای اشتراک سالن", en: "Subscription invoices & receipts" },
  "invoices.empty": { fa: "فاکتوری ثبت نشده است.", en: "No invoices yet." },

  "campaigns.name": { fa: "نام کمپین", en: "Campaign name" },
  "campaigns.message": { fa: "متن پیام", en: "Message" },
  "campaigns.channel": { fa: "کانال", en: "Channel" },
  "campaigns.sms": { fa: "پیامک", en: "SMS" },
  "campaigns.email": { fa: "ایمیل", en: "Email" },
  "campaigns.segment": { fa: "بخش هدف", en: "Segment" },
  "campaigns.all": { fa: "همهٔ مشتریان مراجعه‌کرده", en: "Completed customers" },
  "campaigns.returning": { fa: "مشتریان بازگشتی", en: "Returning customers" },
  "campaigns.create": { fa: "ثبت کمپین", en: "Create campaign" },
  "campaigns.run": { fa: "اجرا", en: "Run" },
  "campaigns.empty": { fa: "کمپینی ثبت نشده است.", en: "No campaigns yet." },
  "campaigns.required": { fa: "نام و پیام کمپین الزامی است.", en: "Campaign name and message are required." },
  "campaigns.queued": { fa: "کمپین در صف ارسال قرار گرفت.", en: "Campaign queued for delivery." },

  "domain.placeholder": { fa: "booking.yoursalon.com", en: "booking.yoursalon.com" },
  "domain.submit": { fa: "ثبت دامنه", en: "Request domain" },
  "domain.verify": { fa: "تأیید DNS", en: "Verify DNS" },
  "domain.pending": { fa: "دامنه ثبت شد؛ رکورد TXT را تنظیم و سپس تأیید کنید.", en: "Domain requested. Configure the TXT record, then verify." },
  "domain.verified": { fa: "دامنه تأیید و فعال شد.", en: "Domain verified and active." },
  "domain.txt": { fa: "رکورد TXT زیر را تنظیم کنید:", en: "Configure this TXT record:" },

  "data.exportAppointments": { fa: "خروجی Excel نوبت‌ها", en: "Export appointments (Excel)" },
  "data.exportCustomers": { fa: "خروجی Excel مشتریان", en: "Export customers (Excel)" },
  "data.customers": { fa: "مشتریان", en: "Customers" },
  "data.appointments": { fa: "نوبت‌ها", en: "Appointments" },
  "data.placeholder": { fa: "آرایه JSON داده قدیمی را وارد کنید", en: "Paste legacy JSON rows" },
  "data.import": { fa: "ورود داده قدیمی", en: "Import legacy data" },
  "data.imported": { fa: "ورود داده انجام شد.", en: "Import completed." },
  "data.invalidJson": { fa: "JSON نامعتبر است.", en: "Invalid JSON." },

  "theme.toggle": { fa: "تغییر حالت شب/روز", en: "Toggle dark mode" },
  "common.currency": { fa: "تومان", en: "Toman" },
  "common.save": { fa: "ذخیره", en: "Save" },
  "common.paid": { fa: "پرداخت شده", en: "Paid" },
  "common.pending": { fa: "در انتظار", en: "Pending" },
};

function translate(lang: Lang, key: string): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang];
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  dir: "rtl" | "ltr";
}

const Ctx = createContext<I18nCtx>({ lang: "fa", setLang: () => {}, t: (k) => k, dir: "rtl" });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "fa";
    try {
      const saved = localStorage.getItem("nobino_lang") as Lang | null;
      if (saved === "fa" || saved === "en") return saved;
    } catch {}
    return "fa";
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("nobino_lang", l);
    } catch {}
    document.documentElement.dir = l === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = l;
  };

  useEffect(() => {
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <Ctx.Provider value={{ lang, setLang, t: (k) => translate(lang, k), dir: lang === "fa" ? "rtl" : "ltr" }}>
      {children}
    </Ctx.Provider>
  );
}

export function useI18n() {
  return useContext(Ctx);
}

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === "fa" ? "en" : "fa")}
      className="flex h-10 items-center justify-center rounded-xl border border-neutral-200 bg-white/60 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-100 dark:border-white/15 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/15"
    >
      {lang === "fa" ? "EN" : "فا"}
    </button>
  );
}
