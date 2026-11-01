/** رزرو صوتی — معادل src/app/dashboard/voice-booking/page.tsx */
import { Navigate, Link } from "@/next";
import { ArrowRight, CalendarDays, Sparkles } from "lucide-react";
import AdminVoiceBooking from "@/components/AdminVoiceBooking";
import { useAuth } from "@/auth";
import { usePageData } from "@/lib/page-data";
import { useMeta } from "@/lib/use-meta";

type VoiceData = {
  redirect?: string;
  salon?: { id: string; name: string; timezone: string; branches: { id: string; name: string }[] };
  autoBranchId?: string | null;
};

export default function DashboardVoiceBooking() {
  const { me } = useAuth();
  const { data, loading } = usePageData<VoiceData>("voice-booking");
  useMeta("رزرو صوتی — نوبینو");

  if (!me) return <Navigate to="/login" replace />;
  if (loading && !data) {
    return <div className="flex min-h-[40vh] items-center justify-center text-neutral-500">در حال بارگذاری…</div>;
  }
  if (data?.redirect) return <Navigate to={data.redirect} replace />;
  const salon = data?.salon;
  if (!salon) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[60] overflow-y-auto bg-gradient-to-b from-pink-50 via-neutral-50 to-purple-50 sm:px-6 sm:py-8 dark:from-neutral-950 dark:via-neutral-950 dark:to-neutral-900"
    >
      <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col bg-white sm:min-h-[calc(100dvh-4rem)] sm:rounded-[2.5rem] sm:shadow-2xl sm:ring-1 sm:ring-black/5 dark:bg-neutral-900 dark:sm:ring-neutral-800">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-neutral-100 bg-white/90 px-3 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-neutral-100 px-3.5 text-sm font-black text-neutral-700 transition active:scale-95 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <ArrowRight className="h-4 w-4" /> داشبورد
          </Link>
          <span className="text-sm font-black text-neutral-800 dark:text-neutral-100">رزرو صوتی</span>
          <Link
            href="/dashboard/appointments"
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#1c2434] px-3.5 text-sm font-black text-white transition active:scale-95 dark:bg-white dark:text-neutral-900"
          >
            <CalendarDays className="h-4 w-4" /> نوبت‌ها
          </Link>
        </header>

        <div className="px-5 pt-4 text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-3 py-1 text-[10px] font-black text-pink-600 dark:bg-pink-900/30 dark:text-pink-300">
            <Sparkles className="h-3 w-3" /> {salon.name}
          </span>
          <h1 className="mt-2 text-lg font-black leading-7 text-neutral-900 dark:text-neutral-50">
            یک جمله بگویید، نوبت ثبت شود
          </h1>
        </div>

        <AdminVoiceBooking
          salonId={salon.id}
          timezone={salon.timezone}
          branches={salon.branches}
          autoBranchId={data?.autoBranchId ?? undefined}
        />
      </div>
    </div>
  );
}
