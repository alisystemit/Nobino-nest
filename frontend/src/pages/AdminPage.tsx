/** پنل سوپرادمین — معادل src/app/admin/page.tsx (دیتا از /api/pages/admin) */
import { Navigate, Link, useSearchParams } from "@/next";
import { BadgeCheck, Banknote, Store, Users } from "lucide-react";
import { formatToman, toPersianDigits } from "@/lib/utils";
import AdminShell from "@/components/AdminShell";
import AdminExtras from "@/components/AdminExtras";
import { StatCard } from "@/components/ui/Stats";
import { usePageData } from "@/lib/page-data";
import { useMeta } from "@/lib/use-meta";

type AdminData = {
  redirect?: string;
  tab?: string;
  hasPassword?: boolean;
  counts?: {
    salons: number;
    customers: number;
    subscriptions: number;
    revenue: number;
    pendingSalons: number;
    todayAppts: number;
    openTickets: number;
    activePackages: number;
  };
};

export default function AdminPage() {
  const sp = useSearchParams();
  const tab = sp.get("tab") ?? undefined;
  const { data, loading } = usePageData<AdminData>("admin", { tab });
  useMeta("مدیریت پلتفرم — نوبینو");

  if (loading && !data) {
    return (
      <AdminShell title="مدیریت پلتفرم">
        <div className="py-16 text-center text-neutral-500">در حال بارگذاری…</div>
      </AdminShell>
    );
  }
  if (data?.redirect) return <Navigate to={data.redirect} replace />;
  const counts = data?.counts;
  if (!counts || !data) return null;
  const initialTab = data.tab ?? "metrics";

  const cards = [
    { label: "سالن‌ها", value: toPersianDigits(counts.salons), icon: <Store className="h-5 w-5" />, iconClass: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300", sub: `${toPersianDigits(counts.pendingSalons)} در انتظار تأیید` },
    { label: "مشتریان", value: toPersianDigits(counts.customers), icon: <Users className="h-5 w-5" />, iconClass: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300", sub: "کاربران ثبت‌نام‌شده پلتفرم" },
    { label: "اشتراک فعال", value: toPersianDigits(counts.subscriptions), icon: <BadgeCheck className="h-5 w-5" />, iconClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300", sub: `${toPersianDigits(counts.activePackages)} پکیج فعال` },
    { label: "درآمد کل", value: formatToman(counts.revenue), icon: <Banknote className="h-5 w-5" />, iconClass: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300", sub: "مجموع سفارش‌های پرداخت‌شده" },
  ];

  const mini = [
    { label: "نوبت امروز", value: toPersianDigits(counts.todayAppts), href: "/admin?tab=salons" },
    { label: "سالن در انتظار تأیید", value: toPersianDigits(counts.pendingSalons), href: "/admin?tab=salons" },
    { label: "تیکت باز پشتیبانی", value: toPersianDigits(counts.openTickets), href: "/admin?tab=support" },
    { label: "پکیج فعال", value: toPersianDigits(counts.activePackages), href: "/admin?tab=packages" },
  ];

  return (
    <AdminShell title="مدیریت پلتفرم">
      {counts.pendingSalons > 0 && (
        <Link
          href="/admin?tab=salons"
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 transition hover:bg-amber-100 dark:border-amber-900/60 dark:bg-amber-950/40 dark:hover:bg-amber-950/60"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-xl">⏳</span>
            <div>
              <div className="font-extrabold text-amber-800 dark:text-amber-200">
                {toPersianDigits(counts.pendingSalons)} سالن در انتظار تأیید شماست
              </div>
              <div className="text-xs text-amber-700/80 dark:text-amber-300/70">برای فعال‌شدن صفحه عمومی، بررسی و تأیید کنید.</div>
            </div>
          </div>
          <span className="text-sm font-black text-amber-700 dark:text-amber-300">بررسی ←</span>
        </Link>
      )}

      {!data.hasPassword && (
        <Link
          href="/admin?tab=security"
          className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 transition hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40 dark:hover:bg-red-950/60"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-400/20 text-xl">🔐</span>
            <div>
              <div className="font-extrabold text-red-800 dark:text-red-200">رمز عبور ورود تنظیم نشده است</div>
              <div className="text-xs text-red-700/80 dark:text-red-300/70">برای امنیت حساب مدیر، همین حالا رمز عبور تعیین کنید تا ورود دومرحله‌ای فعال شود.</div>
            </div>
          </div>
          <span className="text-sm font-black text-red-700 dark:text-red-300">تنظیم رمز ←</span>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} iconClass={c.iconClass} sub={c.sub} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {mini.map((m) => (
          <Link key={m.label} href={m.href} className="group rounded-2xl border border-neutral-200 bg-white px-5 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-xl font-black text-neutral-900 group-hover:text-pink-600 dark:text-neutral-100">{m.value}</div>
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{m.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <AdminExtras key={initialTab} initialTab={initialTab} />
      </div>
    </AdminShell>
  );
}
