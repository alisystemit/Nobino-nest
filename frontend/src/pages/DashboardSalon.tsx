/** سالن من — معادل src/app/dashboard/salon/page.tsx (دیتا از /api/pages/dashboard-salon) */
import { Navigate, Link, useSearchParams } from "@/router-shim";
import { toPersianDigits } from "@/lib/utils";
import { UNLIMITED_FROM } from "@/lib/plans/limit-defs";
import { displayUrl } from "@/lib/site";
import SalonManager from "@/components/SalonManager";
import DailyBoard from "@/components/DailyBoard";
import DashboardShell from "@/components/DashboardShell";
import { StatCard, PanelCard, Badge } from "@/components/ui/Stats";
import { CalendarDays, Scissors, Images, Star, Settings, Rocket, ClipboardList, Mic, PenLine, Store, Gauge, Plus,Megaphone } from "lucide-react";
import { useAuth } from "@/auth";
import { usePageData } from "@/lib/page-data";

const planLabels: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "brand" }> = {
  FREE: { label: "پلن رایگان", tone: "neutral" },
  BASIC: { label: "پلن پایه", tone: "neutral" },
  PRO: { label: "پلن حرفه‌ای", tone: "warning" },
  ENTERPRISE: { label: "پلن سازمانی", tone: "success" },
};

function faDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(d));
}

type SalonData = {
  redirect?: string;
  mode?: "create" | "salon";
  mySalons?: { id: string; name: string }[];
  salon?: any;
  snap?: { planLabel: string; counts: { key: string; label: string; icon: string; used: number; limit: number }[]; bools: { key: string; label: string; icon: string; on: boolean }[] };
  publicUrl?: string;
};

export default function DashboardSalon() {
  const { me } = useAuth();
  const sp = useSearchParams();
  const salon = sp.get("salon") ?? undefined;
  const isNew = sp.get("new") ?? undefined;
  const { data, loading } = usePageData<SalonData>("dashboard-salon", { salon, new: isNew });

  if (!me) return <Navigate to="/login" replace />;
  if (loading && !data) {
    return (
      <DashboardShell role={me.role} title="سالن من">
        <div className="py-16 text-center text-neutral-500">در حال بارگذاری…</div>
      </DashboardShell>
    );
  }
  if (data?.redirect) return <Navigate to={data.redirect} replace />;
  if (!data) return null;

  // حالت ساخت سالن (بدون سالن یا درخواست ?new=1) — دقیقاً همان ویزارد کامل راه‌اندازی
  if (data.mode === "create") {
    return <Navigate to="/dashboard/setup?new=1" replace />;
  }

  const s = data.salon;
  const mySalons = data.mySalons ?? [];
  if (!s) return null;
  const snap = data.snap!;

  const plan = planLabels[s.plan] ?? planLabels.FREE;
  const subEnd = faDate(s.subscriptionEndsAt);
  const trialEnd = faDate(s.trialEndsAt);
  const today = new Date();
  const subActive = s.subscriptionEndsAt ? new Date(s.subscriptionEndsAt) > today : false;

  return (
    <DashboardShell role={me.role} title="سالن من">
      {/* نوار وضعیت سالن */}
      <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-l from-[#1c2434] to-[#2a3450] p-4 text-white shadow-lg sm:p-6">
        <div className="pointer-events-none absolute -left-10 -top-10 h-44 w-44 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -right-12 h-44 w-44 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black sm:text-2xl">{s.name}</h1>
              <Badge tone={plan.tone}>{plan.label}</Badge>
              {!s.isApproved && <Badge tone="warning">در انتظار تأیید</Badge>}
              {!s.isActive && <Badge tone="danger">غیرفعال</Badge>}
              {subActive && <Badge tone="success">اشتراک فعال</Badge>}
            </div>
            <p className="mt-2 break-all text-xs text-neutral-300 sm:text-sm">
              صفحه: <span dir="ltr" className="font-mono">{displayUrl(data.publicUrl ?? "")}</span>
              <span className="mx-2 text-neutral-500">|</span>
              تلفن: {toPersianDigits(s.phone)}
            </p>
            {(subEnd || trialEnd) && (
              <p className="mt-1 text-xs text-neutral-400">
                {subEnd ? `اشتراک تا ${subEnd}${s.autoRenew ? " (تمدید خودکار)" : ""}` : ""}
                {!subEnd && trialEnd ? `دوره آزمایشی تا ${trialEnd}` : ""}
              </p>
            )}
          </div>
          <Link
            href={`/s/${s.slug}`}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-[#1c2434] shadow-xl transition hover:scale-[1.03] sm:w-auto"
          >
            <Store className="h-4 w-4" />
            مشاهده صفحه عمومی
          </Link>
        </div>
      </div>

      {/* سوییچر سالن‌ها — فقط وقتی کاربر بیش از یک سالن دارد */}
      {mySalons.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="px-1 text-xs font-bold text-neutral-500">سالن‌های من:</span>
          {mySalons.map((ms) => {
            const active = ms.id === s.id;
            return (
              <Link
                key={ms.id}
                href={`/dashboard/salon?salon=${ms.id}`}
                className={`rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${
                  active
                    ? "bg-[#1c2434] text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                }`}
              >
                {ms.name}
              </Link>
            );
          })}
          <Link
            href="/dashboard/salon?new=1"
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-pink-300 px-3.5 py-1.5 text-sm font-bold text-pink-600 transition hover:bg-pink-50 dark:hover:bg-pink-950/40"
          >
            <Plus className="h-4 w-4" />
            سالن جدید
          </Link>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="مجموع نوبت‌ها" value={toPersianDigits(s._count.appointments)} icon={<CalendarDays className="h-5 w-5" />} sub="کل نوبت‌های ثبت‌شده" />
        <StatCard label="خدمات فعال" value={toPersianDigits(s.services.length)} icon={<Scissors className="h-5 w-5" />} iconClass="bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300" sub="در صفحه عمومی سالن" />
        <StatCard label="آثار گالری" value={toPersianDigits(s._count.galleryItems)} icon={<Images className="h-5 w-5" />} iconClass="bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300" sub="نمونه‌کارهای نمایشی" />
        <StatCard label="نظرات مشتریان" value={toPersianDigits(s._count.reviews)} icon={<Star className="h-5 w-5" />} iconClass="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300" sub="امتیاز و بازخورد صفحه" />
      </div>

      {/* برنامه امروز */}
      <div className="mt-6">
        <PanelCard
          title="برنامه امروز"
          subtitle="نوبت‌های روزانه با ساعت، وضعیت و یادآوری پیامکی"
          icon={<ClipboardList className="h-5 w-5" />}
          action={
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard/new-appointment"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                <PenLine className="h-4 w-4" />
                رزرو دستی
              </Link>
              <Link
                href="/dashboard/voice-booking"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1c2434] px-4 text-sm font-bold text-white transition hover:bg-[#2a3450]"
              >
                <Mic className="h-4 w-4" />
                صفحه رزرو صوتی
              </Link>
            </div>
          }
          bodyClassName="p-5"
        >
          <DailyBoard salonId={s.id} />

          {/* دو مسیر مجزا برای ثبت نوبت: صوتی (هوش مصنوعی) و دستی (تایپ) */}
          <div className="mt-5 flex flex-col items-start gap-3 rounded-2xl bg-gradient-to-l from-purple-600 to-pink-600 p-4 text-white shadow-lg shadow-pink-500/20 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-2xl backdrop-blur sm:h-12 sm:w-12">🎙️</span>
              <div>
                <div className="text-sm font-black sm:text-base">ثبت نوبت — دو مسیر جدا</div>
                <div className="mt-0.5 text-[11px] leading-5 text-white/80 sm:text-xs">صوتی: گفتار فارسی را هوش مصنوعی استخراج می‌کند · دستی: فرم را خودتان تایپ می‌کنید</div>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
              <Link
                href="/dashboard/voice-booking"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-rose-600 shadow-xl transition hover:scale-[1.03] sm:w-auto"
              >
                <Mic className="h-4 w-4" />
                رزرو صوتی هوشمند
              </Link>
              <Link
                href="/dashboard/new-appointment"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/60 bg-white/10 px-5 text-sm font-black text-white backdrop-blur transition hover:bg-white/20 sm:w-auto"
              >
                <PenLine className="h-4 w-4" />
                رزرو دستی نوبت
              </Link>
            </div>
          </div>
        </PanelCard>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PanelCard
            title="تنظیمات سالن"
            subtitle="مدیریت اطلاعات عمومی، ساعات کاری، قوانین رزرو و دامنه اختصاصی"
            icon={<Settings className="h-5 w-5" />}
          >
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              تنظیمات سالن به صفحهٔ اختصاصی منتقل شده است.
            </p>
            <Link href="/dashboard/settings" className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-[#1c2434] px-6 text-sm font-black text-white transition hover:bg-[#2a3450]">
              باز کردن تنظیمات سالن
            </Link>
          </PanelCard>
        </div>

        <div className="flex flex-col gap-5">
          <PanelCard
            title="مصرف پلن"
            subtitle={`سقف‌های ${snap.planLabel} — هر سقف در پنل سوپرادمین قابل تغییر است`}
            icon={<Gauge className="h-5 w-5" />}
          >
            <div className="space-y-3">
              {snap.counts.map((c) => {
                const unlimited = c.limit >= UNLIMITED_FROM;
                const pct = unlimited ? 8 : Math.min(100, Math.round((c.used / Math.max(1, c.limit)) * 100));
                const tone = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";
                return (
                  <div key={c.key}>
                    <div className="flex items-center justify-between text-xs font-bold text-neutral-600 dark:text-neutral-300">
                      <span>
                        {c.icon} {c.label}
                      </span>
                      <span className="text-neutral-400">
                        {unlimited ? "نامحدود" : `${toPersianDigits(c.used)} / ${toPersianDigits(c.limit)}`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {snap.bools.map((b) => (
                <span
                  key={b.key}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    b.on
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-neutral-100 text-neutral-400 line-through dark:bg-neutral-800"
                  }`}
                >
                  {b.icon} {b.label}
                </span>
              ))}
            </div>
            <Link href="/packages" className="mt-4 inline-flex h-10 items-center text-xs font-bold text-pink-600 hover:underline">
              ارتقا برای افزایش سقف‌ها ←
            </Link>
          </PanelCard>

          <PanelCard title="اشتراک و پلن" subtitle="ارتقا یا تمدید اشتراک" icon={<Rocket className="h-5 w-5" />}>
            <div className="text-sm font-black text-neutral-900 dark:text-neutral-100">{plan.label}</div>
            {subEnd && <div className="mt-1 text-xs text-neutral-500">اشتراک تا {subEnd}</div>}
            <Link
              href="/packages"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-4 text-sm font-bold text-white transition hover:scale-[1.02]"
            >
              <Rocket className="h-4 w-4" />
              ارتقای پلن
            </Link>
          </PanelCard>
        </div>
      </div>
    </DashboardShell>
  );
}
