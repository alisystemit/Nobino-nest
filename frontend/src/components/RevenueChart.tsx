"use client";

import { useEffect, useState } from "react";

type ChartData = { labels: string[]; appointments: number[]; revenue: number[]; cancelled: number[] };

/** نمودار SVG ساده (بدون وابستگی) — نوبت/درآمد/لغو آخرین ۳۰ روز + بینش */
export default function RevenueChart({ salonId }: { salonId: string }) {
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboard/salons/${salonId}/revenue`)
      .then((res) => res.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) setData(d);
        else setError(d.error || "خطا");
      })
      .catch(() => {
        if (!cancelled) setError("خطا در بارگیری نمودار");
      });
    return () => {
      cancelled = true;
    };
  }, [salonId]);

  if (error) return <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="py-6 text-center text-sm text-neutral-400">در حال بارگیری نمودار...</p>;

  const W = 600, H = 180, PAD = 24;
  const maxRev = Math.max(1, ...data.revenue);
  const maxApp = Math.max(1, ...data.appointments);
  const n = data.labels.length;

  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, n - 1);
  const yRev = (v: number) => H - PAD - (v / maxRev) * (H - PAD * 2);
  const yApp = (v: number) => H - PAD - (v / maxApp) * (H - PAD * 2);

  const revPath = data.revenue.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yRev(v).toFixed(1)}`).join(" ");
  const appPath = data.appointments.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yApp(v).toFixed(1)}`).join(" ");

  // ── بینش‌ها ──
  const totalRev = data.revenue.reduce((s, v) => s + v, 0);
  const totalAppt = data.appointments.reduce((s, v) => s + v, 0);
  const totalCancel = data.cancelled.reduce((s, v) => s + v, 0);
  const bestIdx = data.revenue.indexOf(Math.max(...data.revenue));
  const bestDayLabel = data.labels[bestIdx]
    ? new Date(`${data.labels[bestIdx]}T12:00:00`).toLocaleDateString("fa-IR", { month: "long", day: "numeric" })
    : "—";
  const last7 = data.revenue.slice(-7).reduce((s, v) => s + v, 0);
  const prev7 = data.revenue.slice(-14, -7).reduce((s, v) => s + v, 0);
  const growth = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
  const cancelRate = totalAppt > 0 ? Math.round((totalCancel / totalAppt) * 100) : 0;

  const insights = [
    {
      icon: "🏆",
      label: "پردرآمدترین روز",
      value: `${bestDayLabel} · ${data.revenue[bestIdx].toLocaleString("fa-IR")} تومان`,
      cls: "border-amber-100 bg-amber-50/60 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
    },
    {
      icon: growth !== null && growth >= 0 ? "📈" : "📉",
      label: "هفته آخر نسبت به هفته قبل",
      value: growth === null ? "داده کافی نیست" : `${Math.abs(growth)}٪ ${growth >= 0 ? "رشد" : "کاهش"} درآمد`,
      cls: "border-emerald-100 bg-emerald-50/60 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300",
    },
    {
      icon: "🚫",
      label: "نرخ لغو و عدم حضور",
      value: cancelRate >= 20 ? `${cancelRate}٪ — زیاد است، پیگیری کنید` : `${cancelRate}٪ — وضعیت سالم`,
      cls: cancelRate >= 20
        ? "border-red-100 bg-red-50/60 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        : "border-sky-100 bg-sky-50/60 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300",
    },
  ];

  return (
    <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h4 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-200">روند ۳۰ روز اخیر</h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
        {Array.from({ length: 5 }, (_, i) => {
          const y = PAD + (i * (H - PAD * 2)) / 4;
          return <line key={i} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="#e5e7eb" strokeWidth={1} />;
        })}
        <path d={revPath} fill="none" stroke="#ec4899" strokeWidth={2.5} strokeLinecap="round" />
        <path d={appPath} fill="none" stroke="#8b5cf6" strokeWidth={2.5} strokeLinecap="round" />
        {data.revenue.map((v, i) => (
          <circle key={i} cx={x(i)} cy={yRev(v)} r={2.5} fill="#ec4899" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
          <span className="h-2.5 w-2.5 rounded-full bg-pink-500" /> درآمد (تومان)
        </span>
        <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-500" /> تعداد نوبت
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[
          ["مجموع درآمد", totalRev.toLocaleString("fa-IR")],
          ["نوبت‌ها", totalAppt.toLocaleString("fa-IR")],
          ["لغوها", totalCancel.toLocaleString("fa-IR")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-neutral-50 px-2 py-2 dark:bg-neutral-800">
            <div className="text-sm font-black text-neutral-800 dark:text-neutral-100">{value}</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</div>
          </div>
        ))}
      </div>
      {/* بینش‌ها */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {insights.map((i) => (
          <div key={i.label} className={`rounded-xl border px-3 py-2.5 ${i.cls}`}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold opacity-80">
              <span>{i.icon}</span> {i.label}
            </div>
            <div className="mt-1 text-xs font-extrabold leading-relaxed">{i.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
