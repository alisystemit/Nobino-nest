/**
 * مدیریت سالن — صفحهٔ مستقل برای تمام ابزارهای مدیریت سالن
 * (خدمات، کارکنان، مشتریان، تقویم، صندوق، گزارش و...).
 * دیتا از /api/pages/dashboard-salon می‌آید (همان منبع صفحهٔ «سالن من»).
 */
import { Navigate, Link, useSearchParams } from "@/router-shim";
import { subdomainUrl } from "@/lib/subdomain";
import { useAuth } from "@/auth";
import { usePageData } from "@/lib/page-data";
import DashboardShell from "@/components/DashboardShell";
import SalonManager from "@/components/SalonManager";
import { Store } from "lucide-react";

type SalonData = {
  redirect?: string;
  mode?: "create" | "salon";
  mySalons?: { id: string; name: string }[];
  salon?: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
  } | null;
};

export default function DashboardManagement() {
  const { me } = useAuth();
  const sp = useSearchParams();
  const salon = sp.get("salon") ?? undefined;
  const { data, loading } = usePageData<SalonData>("dashboard-salon", { salon });

  if (!me) return <Navigate to="/login" replace />;
  if (loading && !data) {
    return (
      <DashboardShell role={me.role} title="مدیریت سالن">
        <div className="py-16 text-center text-neutral-500">در حال بارگذاری…</div>
      </DashboardShell>
    );
  }
  if (data?.redirect) return <Navigate to={data.redirect} replace />;
  if (!data || data.mode !== "salon" || !data.salon) {
    return <Navigate to="/dashboard/salon" replace />;
  }

  const s = data.salon;
  const mySalons = data.mySalons ?? [];

  return (
    <DashboardShell role={me.role} title="مدیریت سالن">
      {/* سوییچر سالن‌ها — فقط وقتی کاربر بیش از یک سالن دارد */}
      {mySalons.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="px-1 text-xs font-bold text-neutral-500">سالن‌های من:</span>
          {mySalons.map((ms) => {
            const active = ms.id === s.id;
            return (
              <Link
                key={ms.id}
                href={`/dashboard/management?salon=${ms.id}`}
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
        </div>
      )}

      {/* سربرگ سالن */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-l from-[#1c2434] to-[#2a3450] p-4 text-white shadow-lg sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-black sm:text-xl">{s.name}</h1>
            <p className="mt-1 text-xs text-neutral-300">
              مدیریت خدمات، مشتریان، تقویم، صندوق، گزارش و کمپین‌ها
            </p>
          </div>
          <Link
            href={subdomainUrl(s.slug)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black text-[#1c2434] shadow-xl transition hover:scale-[1.03] sm:w-auto"
          >
            <Store className="h-4 w-4" />
            مشاهده صفحه عمومی
          </Link>
        </div>
      </div>

      <SalonManager salonId={s.id} salonSlug={s.slug} timezone={s.timezone} excludeTabs={["staff"]} />
    </DashboardShell>
  );
}
