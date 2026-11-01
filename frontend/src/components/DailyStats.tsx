"use client";

import { useEffect, useState } from "react";
import { toPersianDigits } from "@/lib/utils";

type Stats = {
  hasSalon: boolean;
  salonId?: string;
  slug?: string;
  total: number;
  today: number;
  pending: number;
  balance: number;
};

/** داشبورد روزانه سالن: نوبت امروز، درآمد، لغوها، در انتظار */
export default function DailyStats({ role }: { role: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (role !== "SALON_OWNER" && role !== "ADMIN") return;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/stats");
        const data = await res.json();
        if (data.success) setStats(data.stats);
        else setError(data.error || "خطا");
      } catch {
        setError("خطا در بارگیری آمار");
      }
    })();
  }, [role]);

  if (!stats) return null;

  return (
    <div className="mb-6">
      {error && <p className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
      {stats.hasSalon && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["نوبت امروز", toPersianDigits(stats.today), "📅"],
            ["کل نوبت‌ها", toPersianDigits(stats.total), "🗂️"],
            ["در انتظار تأیید", toPersianDigits(stats.pending), "⏳"],
            ["موجودی کیف پول", stats.balance.toLocaleString("fa-IR"), "💰"],
          ].map(([label, value, icon]) => (
            <div key={label as string} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <div className="text-xl">{icon}</div>
              <div className="mt-2 text-lg font-black text-neutral-900">{value}</div>
              <div className="text-xs text-neutral-500">{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
