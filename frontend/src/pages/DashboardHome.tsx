/** داشبورد — معادل src/app/dashboard/page.tsx (دیتای کاربر از useAuth) */
import { Link } from "@/next";
import { useAuth } from "@/auth";
import { toPersianDigits } from "@/lib/utils";
import DashboardShell from "@/components/DashboardShell";
import { PanelCard } from "@/components/ui/Stats";
import {
  Store,
  CalendarDays,
  Mic,
  PhoneCall,
  User,
  Search,
  Percent,
  Wallet,
  Package,
  ArrowLeft,
} from "lucide-react";

const roleLabels: Record<string, string> = {
  ADMIN: "سوپرادمین",
  SALON_OWNER: "آرایشگر / مالک سالن",
  AGENT: "نماینده",
  CUSTOMER: "مشتری",
};

type QuickCard = { title: string; desc: string; href: string; icon: React.ComponentType<{ className?: string }>; cls: string };

export default function DashboardHome() {
  const { me } = useAuth();
  if (!me) return null;

  const cards: QuickCard[] = [
    ...(me.role === "SALON_OWNER" || me.role === "ADMIN"
      ? [
          { title: "سالن من", desc: "صفحه عمومی، خدمات، گالری و ساعات کاری", href: "/dashboard/salon", icon: Store, cls: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300" },
          { title: "نوبت‌ها", desc: "تأیید و مدیریت نوبت‌ها", href: "/dashboard/appointments", icon: CalendarDays, cls: "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300" },
          { title: "رزرو دستی", desc: "ثبت نوبت با تایپ — مشتری تلفنی یا حضوری", href: "/dashboard/new-appointment", icon: PhoneCall, cls: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300" },
          { title: "رزرو صوتی هوشمند", desc: "ثبت نوبت با صدای فارسی و هوش مصنوعی", href: "/dashboard/voice-booking", icon: Mic, cls: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300" },
        ]
      : []),
    ...(me.role === "CUSTOMER"
      ? [
          { title: "حساب من", desc: "نوبت‌ها، تاریخچه، علاقه‌مندی‌ها و نظرات", href: "/dashboard/account", icon: User, cls: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300" },
          { title: "نوبت‌های من", desc: "مشاهده، تغییر زمان یا لغو نوبت‌ها", href: "/dashboard/appointments", icon: CalendarDays, cls: "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300" },
          { title: "جستجوی سالن", desc: "یافتن سالن بر اساس شهر، خدمت و قیمت", href: "/salons", icon: Search, cls: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300" },
        ]
      : []),
    ...(me.role === "AGENT" || me.role === "ADMIN"
      ? [{ title: "کمیسیون‌ها", desc: "نمایش درصد و درآمد نمایندگی", href: "/dashboard/commission", icon: Percent, cls: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300" }]
      : []),
    { title: "کیف پول", desc: "موجودی و تراکنش‌ها", href: "/dashboard/wallet", icon: Wallet, cls: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300" },
    ...(me.role !== "CUSTOMER"
      ? [{ title: "خرید پکیج", desc: "فروش و فعال‌سازی اشتراک", href: "/packages", icon: Package, cls: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300" }]
      : []),
  ];

  const displayName = me.name ?? me.email ?? me.phone;
  const isEmailAccount = me.phone.startsWith("email:");

  return (
    <DashboardShell role={me.role} title="داشبورد">
      {/* خوش‌آمد */}
      <div className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-l from-pink-600 via-rose-600 to-purple-700 p-4 text-white shadow-lg shadow-pink-500/15 sm:mb-6 sm:p-7">
        <div className="absolute inset-0 bg-hero-pattern" />
        <div className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <h1 className="text-lg font-black sm:text-2xl">سلام، {displayName} 👋</h1>
          <p className="mt-1.5 text-xs leading-6 text-white/80 sm:text-sm">
            نقش: {roleLabels[me.role] ?? me.role}
            <span className="mx-2 text-white/30">|</span>
            {isEmailAccount ? `ایمیل: ${me.email ?? "—"}` : `شماره: ${toPersianDigits(me.phone)}`}
          </p>
        </div>
      </div>

      <PanelCard
        title="دسترسی سریع"
        subtitle="بخش‌هایی که برای نقش شما فعال است"
        bodyClassName="p-3 sm:p-4"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.title}
                href={c.href}
                className="group flex flex-col items-start gap-2.5 rounded-2xl border border-neutral-200 p-3.5 transition hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-md sm:flex-row sm:items-start sm:gap-4 sm:p-4 dark:border-neutral-800 dark:hover:border-pink-800"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12 ${c.cls}`}>
                  <Icon className="h-5 w-5 sm:h-6 sm:h-6" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-neutral-900 sm:text-base dark:text-neutral-100">{c.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-neutral-500 sm:text-xs dark:text-neutral-400">{c.desc}</span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-pink-600 transition group-hover:gap-2 sm:text-xs">
                    مشاهده
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </PanelCard>
    </DashboardShell>
  );
}
