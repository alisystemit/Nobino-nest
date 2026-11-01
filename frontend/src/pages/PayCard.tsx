"use client";

import { useState } from "react";
import { toPersianDigits } from "@/lib/utils";

/** دکمه پرداخت فاکتور خدماتی — ساخت درخواست پرداخت و هدایت به درگاه */
export default function PayCard({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pay/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json();
      if (d.success && d.redirectUrl) {
        window.location.href = d.redirectUrl;
        return;
      }
      setError(d.error || "خطا در ایجاد درخواست پرداخت");
    } catch {
      setError("خطا در ارتباط با سرور پرداخت");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        onClick={pay}
        disabled={loading}
        className="w-full rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 py-4 text-base font-black text-white shadow-lg shadow-pink-500/30 transition hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "در حال اتصال به درگاه پرداخت..." : toPersianDigits("پرداخت آنلاین فاکتور")}
      </button>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-center text-sm text-red-600">{error}</p>}
      <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-400">
        🔒 پرداخت شما با پروتکل امن و رمزنگاری‌شده انجام می‌شود
      </p>
    </div>
  );
}
