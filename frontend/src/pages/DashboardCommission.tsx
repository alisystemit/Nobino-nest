"use client";

import { useEffect, useState } from "react";
import { Link } from "@/next";
import DashboardShell from "@/components/DashboardShell";
import { StatCard, PanelCard, Badge } from "@/components/ui/Stats";
import { TrendingUp, Wallet, Handshake, ExternalLink } from "lucide-react";

type Summary = {
  balance: number;
  totalEarned: number;
  activePlanCount: number;
  totalEarnedLabel: string;
  balanceLabel: string;
  plans: { salonName: string; slug: string; percent: number }[];
};

export default function CommissionPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/commission");
        const data = await res.json();
        if (data.success) setSummary(data.summary);
        else if (res.status === 403) setError("بخش کمیسیون مخصوص نمایندگان فروش و مدیران است؛ به این بخش دسترسی ندارید.");
        else setError(data.error || "خطا در دریافت اطلاعات");
      } catch {
        setError("خطا در ارتباط با سرور");
      }
    })();
  }, []);

  if (error) {
    return (
      <DashboardShell role="AGENT" title="کمیسیون">
        <div className="mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm sm:p-10 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-4xl">🔒</div>
          <p className="mt-4 font-bold text-neutral-700 dark:text-neutral-200">{error}</p>
          <Link href="/dashboard" className="mt-5 inline-block rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-5 py-2.5 text-sm font-black text-white">
            بازگشت به داشبورد
          </Link>
        </div>
      </DashboardShell>
    );
  }

  if (!summary) return <DashboardShell role="AGENT" title="کمیسیون"><p className="py-10 text-center text-neutral-400">در حال بارگیری...</p></DashboardShell>;

  return (
    <DashboardShell role="AGENT" title="کمیسیون نمایندگی">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard
          label="مجموع درآمد کمیسیون"
          value={summary.totalEarnedLabel}
          icon={<TrendingUp className="h-5 w-5" />}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
          sub="کل درآمد از نمایندگی‌ها"
        />
        <StatCard
          label="موجودی فعلی"
          value={summary.balanceLabel}
          icon={<Wallet className="h-5 w-5" />}
          iconClass="bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300"
          sub="قابل برداشت از کیف پول"
        />
        <div className="col-span-2 sm:col-span-1">
        <StatCard
          label="نمایندگی فعال"
          value={String(summary.activePlanCount)}
          icon={<Handshake className="h-5 w-5" />}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
          sub="سالن تحت پوشش شما"
        />
        </div>
      </div>

      <div className="mt-6">
        <PanelCard
          title="سالن‌های تحت نمایندگی"
          subtitle={`${summary.plans.length} سالن فعال با قرارداد کمیسیون`}
          icon={<Handshake className="h-5 w-5" />}
          bodyClassName="p-0"
        >
          {summary.plans.length === 0 ? (
            <p className="py-10 text-center text-neutral-400">هیچ نمایندگی فعالی وجود ندارد.</p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {summary.plans.map((p) => (
                <div key={p.slug} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                  <div className="font-bold text-neutral-800 dark:text-neutral-100">{p.salonName}</div>
                  <div className="flex items-center gap-3">
                    <Badge tone="brand">{p.percent}٪ کمیسیون</Badge>
                    <Link
                      href={`/s/${p.slug}`}
                      className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-bold text-pink-600 transition hover:bg-pink-50 hover:text-pink-700 dark:hover:bg-pink-950/30"
                    >
                      مشاهده
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </DashboardShell>
  );
}
