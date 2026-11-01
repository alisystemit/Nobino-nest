"use client";

/**
 * تنظیمات سالن — صفحهٔ اختصاصی (منتقل‌شده از داشبورد سالن).
 * شامل اطلاعات عمومی، ساعات کاری، قوانین رزرو، گالری و دامنهٔ اختصاصی.
 */
import { useEffect, useState } from "react";
import { Navigate } from "@/router-shim";
import DashboardShell from "@/components/DashboardShell";
import SalonSettings from "@/components/SalonSettings";
import { useAuth } from "@/auth";

type SalonLite = {
  id: string;
  name: string;
  slug: string;
  phone: string;
  [key: string]: unknown;
};

export default function DashboardSettings() {
  const { me } = useAuth();
  const [salons, setSalons] = useState<SalonLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [salonId, setSalonId] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/salons")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: SalonLite[] = d.success ? d.salons : [];
        setSalons(list);
        if (list.length) setSalonId(list[0].id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!me) return <Navigate to="/login" replace />;
  if (loading) {
    return (
      <DashboardShell role={me.role} title="تنظیمات سالن">
        <div className="py-16 text-center text-neutral-500">در حال بارگذاری…</div>
      </DashboardShell>
    );
  }
  if (salons.length === 0) return <Navigate to="/dashboard/salon?new=1" replace />;

  const salon = salons.find((s) => s.id === salonId) ?? salons[0];

  return (
    <DashboardShell role={me.role} title="تنظیمات سالن">
      <div className="mx-auto max-w-3xl">
        {salons.length > 1 && (
          <div className="mb-5 flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-500">سالن:</span>
            <select
              className="h-11 flex-1 rounded-xl border border-neutral-200 bg-white px-3.5 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              value={salon.id}
              onChange={(e) => setSalonId(e.target.value)}
            >
              {salons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <SalonSettings salon={salon as any} />
      </div>
    </DashboardShell>
  );
}
