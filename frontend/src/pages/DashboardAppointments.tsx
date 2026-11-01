/** نوبت‌ها — معادل src/app/dashboard/appointments/page.tsx (دیتا از /api/pages/agenda) */
import { Navigate, useSearchParams } from "@/next";
import DashboardShell from "@/components/DashboardShell";
import AppointmentsAgenda from "@/components/appointments/AppointmentsAgenda";
import { useAuth } from "@/auth";
import { usePageData } from "@/lib/page-data";
import { useMeta } from "@/lib/use-meta";

type AgendaData = {
  redirect?: string;
  agenda?: {
    rows: any[];
    dayISO: string;
    todayISO: string;
    timezone: string;
    role: string;
    salons: { id: string; name: string }[];
    activeSalonId: string | null;
  };
};

export default function DashboardAppointments() {
  const { me, loading: authLoading } = useAuth();
  const sp = useSearchParams();
  const date = sp.get("date") ?? undefined;
  const salon = sp.get("salon") ?? undefined;
  useMeta("نوبت‌ها — نوبینو");

  // تا روشن شدن وضعیت نشست درخواست نزن (جلوگیری از 401 بی‌مورد)
  const { data } = usePageData<AgendaData>("agenda", authLoading ? {} : { date, salon });

  if (authLoading) return <main className="flex min-h-[40vh] items-center justify-center text-neutral-500">در حال بارگذاری…</main>;
  if (!me) return <Navigate to="/login" replace />;
  if (!data?.agenda) {
    if (data?.redirect) return <Navigate to={data.redirect} replace />;
    return <main className="flex min-h-[40vh] items-center justify-center text-neutral-500">در حال بارگذاری…</main>;
  }
  const agenda = data.agenda;

  return (
    <DashboardShell role={me.role} title="نوبت‌ها">
      <AppointmentsAgenda
        items={agenda.rows}
        dayISO={agenda.dayISO}
        todayISO={agenda.todayISO}
        timezone={agenda.timezone}
        role={agenda.role}
        salons={agenda.salons}
        activeSalonId={agenda.activeSalonId}
      />
    </DashboardShell>
  );
}
