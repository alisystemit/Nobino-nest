/** رزرو دستی — معادل src/app/dashboard/new-appointment/page.tsx */
import { Navigate, Link } from "@/router-shim";
import { Mic } from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import ManualBooking from "@/components/ManualBooking";
import { useAuth } from "@/auth";
import { usePageData } from "@/lib/page-data";
import { useMeta } from "@/lib/use-meta";

type NewApptData = { redirect?: string; salon?: { id: string; timezone: string } };

export default function DashboardNewAppointment() {
  const { me } = useAuth();
  const { data, loading } = usePageData<NewApptData>("new-appointment");
  useMeta("رزرو دستی — نوبینو");

  if (!me) return <Navigate to="/login" replace />;
  if (loading && !data) {
    return (
      <DashboardShell role={me.role} title="رزرو دستی">
        <div className="py-16 text-center text-neutral-500">در حال بارگذاری…</div>
      </DashboardShell>
    );
  }
  if (data?.redirect) return <Navigate to={data.redirect} replace />;
  const salon = data?.salon;
  if (!salon) return null;

  return (
    <DashboardShell role={me.role} title="رزرو دستی">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            نوبت را تایپ کنید — مناسب مشتری تلفنی یا حضوری. <Link href="/dashboard/voice-booking" className="font-bold text-pink-600 hover:underline dark:text-pink-400">رزرو صوتی هوشمند اینجاست</Link>.
          </p>
        </div>
        <ManualBooking salonId={salon.id} timezone={salon.timezone} />
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-neutral-400">
          <Mic className="h-3.5 w-3.5" />
          این صفحه مستقل از رزرو صوتی است؛ هیچ بخشی از آن به میکروفون نیاز ندارد و روی http هم کامل کار می‌کند.
        </p>
      </div>
    </DashboardShell>
  );
}
