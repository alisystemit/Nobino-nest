"use client";

import { useEffect, useState } from "react";

type ChartData = { months: string[]; revenue: number[]; userGrowth: number[]; appointments: number[]; cancelled: number[]; churn: number[] };

function Line({ data, color, labels, format }: { data: number[]; color: string; labels: string[]; format?: (v: number) => string }) {
  const W = 640, H = 180, PAD = 26;
  const max = Math.max(1, ...data);
  const n = data.length;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / Math.max(1, n - 1);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(n - 1).toFixed(1)} ${H - PAD} L ${PAD} ${H - PAD} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id={`fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, i) => {
          const yy = PAD + (i * (H - PAD * 2)) / 4;
          return <line key={i} x1={PAD} y1={yy} x2={W - PAD} y2={yy} stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 4" />;
        })}
        <path d={area} fill={`url(#fill-${color.replace("#", "")})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        {data.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={color} />
        ))}
        <text x={PAD} y={14} className="fill-neutral-500" fontSize="10">
          {format ? format(max) : String(max)}
        </text>
        {labels.length > 0 && (
          <text x={PAD} y={H - 8} className="fill-neutral-400" fontSize="10">
            {labels[0]}
          </text>
        )}
        {labels.length > 1 && (
          <text x={W - PAD} y={H - 8} textAnchor="end" className="fill-neutral-400" fontSize="10">
            {labels[labels.length - 1]}
          </text>
        )}
      </svg>
    </div>
  );
}

/** بینش متنی هر نمودار: روند ماه آخر نسبت به ماه قبل + بهترین ماه + میانگین */
function insightFor(data: number[], months: string[], format: (v: number) => string): { text: string; good: boolean } {
  const d = data;
  const last = d[d.length - 1] ?? 0;
  const prev = d.length > 1 ? d[d.length - 2] : 0;
  const bestIdx = d.indexOf(Math.max(...d));
  const avg = Math.round(d.reduce((s, v) => s + v, 0) / Math.max(1, d.length));
  const pct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;

  let text = `میانگین ماهانه ${format(avg)}`;
  if (months[bestIdx] !== undefined) text += ` — بهترین ماه: ${months[bestIdx]} (${format(d[bestIdx])})`;
  if (pct !== null) {
    text += ` — ماه آخر ${pct >= 0 ? `${Math.abs(pct)}٪ رشد` : `${Math.abs(pct)}٪ کاهش`} نسبت به ماه قبل`;
  }
  return { text, good: pct === null || pct >= 0 };
}

export default function AdminCharts() {
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/charts")
      .then((res) => res.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success) setData(d as ChartData);
        else setError(d.error || "خطا");
      })
      .catch(() => {
        if (!cancelled) setError("خطا در دریافت نمودارها");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>;
  if (!data) return <p className="py-6 text-center text-neutral-400 dark:text-neutral-500">در حال بارگیری نمودارها...</p>;

  const inv = (v: number) => v.toLocaleString("fa-IR");

  const charts = [
    { title: "درآمد ماهانه (تومان)", data: data.revenue, color: "#ec4899", fmt: inv, good: true },
    { title: "رشد کاربران جدید", data: data.userGrowth, color: "#8b5cf6", fmt: inv, good: true },
    { title: "نوبت‌های ثبت‌شده", data: data.appointments, color: "#0ea5e9", fmt: inv, good: true },
    { title: "نوبت‌های لغو/عدم حضور", data: data.cancelled, color: "#f43f5e", fmt: inv, good: false },
    { title: "ریزش اشتراک (لغو/منقضی)", data: data.churn, color: "#f59e0b", fmt: inv, good: false },
  ];

  // بینش کلی: درآمد، رشد کاربر و نرخ لغو نوبت‌ها
  const revInsight = insightFor(data.revenue, data.months, inv);
  const lastAppts = data.appointments[data.appointments.length - 1] ?? 0;
  const lastCancelled = data.cancelled[data.cancelled.length - 1] ?? 0;
  const cancelRate = lastAppts > 0 ? Math.round((lastCancelled / lastAppts) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* خلاصه بینش کلی */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-pink-100 bg-pink-50/60 px-4 py-3 dark:border-pink-900/50 dark:bg-pink-950/30">
          <div className="text-[11px] font-bold text-pink-600 dark:text-pink-400">💰 درآمد</div>
          <div className="mt-1 text-sm font-extrabold leading-relaxed text-neutral-800 dark:text-neutral-200">{revInsight.text}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 dark:border-violet-900/50 dark:bg-violet-950/30">
          <div className="text-[11px] font-bold text-violet-600 dark:text-violet-400">👥 رشد کاربران</div>
          <div className="mt-1 text-sm font-extrabold leading-relaxed text-neutral-800 dark:text-neutral-200">{insightFor(data.userGrowth, data.months, inv).text}</div>
        </div>
        <div className={`rounded-2xl border px-4 py-3 ${cancelRate >= 20 ? "border-red-100 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/30" : "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/30"}`}>
          <div className={`text-[11px] font-bold ${cancelRate >= 20 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>📉 نرخ لغو نوبت</div>
          <div className="mt-1 text-sm font-extrabold leading-relaxed text-neutral-800 dark:text-neutral-200">
            {cancelRate}٪ از نوبت‌های ماه آخر لغو یا عدم حضور بوده‌اند — {cancelRate >= 20 ? "نیاز به بررسی دارد" : "در وضعیت سالم"}
          </div>
        </div>
      </div>

      {charts.map((c) => {
        const ins = insightFor(c.data, data.months, c.fmt);
        return (
          <div key={c.title} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-200">{c.title}</h4>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${c.good ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                {c.good ? "هرچه بیشتر بهتر" : "هرچه کمتر بهتر"}
              </span>
            </div>
            <Line data={c.data} color={c.color} labels={data.months} format={c.fmt} />
            <div className="mt-2 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold leading-relaxed text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
              💡 {ins.text}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.months.map((m) => (
                <span key={m} className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  {m}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
