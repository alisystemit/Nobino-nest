"use client";

import { useEffect, useState } from "react";
import { Link } from "@/next";
import { useRouter } from "@/next";

// مشتریان به پکیج‌ها دسترسی ندارند
async function isCustomer(): Promise<boolean> {
  try {
    const me = await (await fetch("/api/auth/me")).json();
    return me.user?.role === "CUSTOMER";
  } catch {
    return false;
  }
}

type Feature = { key: string | null; label: string; icon: string };
type Pkg = { id: string; name: string; description?: string; price: number; yearlyPrice?: number | null; durationDays: number; features: Feature[] };
type Gateway = { id: string; name: string; sandbox: boolean };

export default function PackagesPage() {
  const router = useRouter();
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [gateway, setGateway] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [period, setPeriod] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [autoRenew, setAutoRenew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (await isCustomer()) {
        router.replace("/dashboard");
        return;
      }
      try {
        const [pkgRes, gwRes] = await Promise.all([
          fetch("/api/packages"),
          fetch("/api/payments/gateways"),
        ]);
        const pkgData = await pkgRes.json();
        const gwData = await gwRes.json();
        setPackages(pkgData.packages ?? []);
        setGateways(gwData.gateways ?? []);
        setGateway(gwData.gateways?.[0]?.id ?? "");

      } catch {
        setError("خطا در بارگیری داده‌ها");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function buy(pkgId: string) {
    setBuying(pkgId);
    setError("");
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkgId, gateway, discountCode: discountCode || undefined, period, autoRenew }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "خطا در ایجاد پرداخت");
        return;
      }
      // انتقال به درگاه یا صفحه تست
      if (data.redirectUrl) {
        window.location.assign(data.redirectUrl);
      } else {
        router.push(`/payment/result?status=success`);
      }
    } catch {
      setError("خطای شبکه");
    } finally {
      setBuying(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <div className="text-center">
        <h1 className="text-2xl font-black text-neutral-900 sm:text-3xl">پکیج‌های نوبینو</h1>
        <p className="mt-2 text-sm text-neutral-500 sm:text-base">برای آرایشگاه خود، یکی از پکیج‌ها را انتخاب کنید.</p>
      </div>

      {loading ? (
        <p className="mt-16 text-center text-neutral-400">در حال بارگیری...</p>
      ) : (
        <>
          <div className="mx-auto mt-6 max-w-md space-y-3 sm:mt-8">
            <div className="flex gap-2 rounded-2xl bg-neutral-100 p-1.5">
              <button onClick={() => setPeriod("MONTHLY")} className={`h-11 flex-1 rounded-xl text-sm font-bold transition ${period === "MONTHLY" ? "bg-white text-pink-600 shadow" : "text-neutral-500"}`}>ماهانه</button>
              <button onClick={() => setPeriod("YEARLY")} className={`h-11 flex-1 rounded-xl text-sm font-bold transition ${period === "YEARLY" ? "bg-white text-pink-600 shadow" : "text-neutral-500"}`}>سالانه</button>
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input type="checkbox" className="h-4 w-4 accent-pink-600" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              تمدید خودکار اشتراک
            </label>
            <div>
              <label className="text-xs font-medium text-neutral-500">کد تخفیف (اختیاری)</label>
              <input
                dir="ltr"
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                placeholder="مثلاً NOBINO20"
                className="mt-1 h-12 w-full rounded-xl border border-neutral-300 px-4 text-center text-sm outline-none focus:border-pink-500"
              />
            </div>
          </div>

          <div className="mt-6 grid items-stretch gap-4 sm:mt-10 sm:gap-6 md:grid-cols-3">
            {packages.map((p, idx) => {
              const featured = idx === 1;
              return (
                <div
                  key={p.id}
                  className={`relative flex flex-col rounded-3xl p-5 transition card-hover sm:rounded-[2rem] sm:p-8 ${
                    featured
                      ? "border-2 border-pink-500 bg-gradient-to-b from-pink-50 to-purple-50 shadow-2xl shadow-pink-500/20 dark:from-pink-950/40 dark:to-purple-950/40"
                      : "border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 right-6 rounded-full bg-gradient-to-l from-pink-600 to-purple-600 px-4 py-1 text-xs font-black text-white shadow-lg">
                      ⭐ پیشنهاد ویژه
                    </span>
                  )}
                  <h3 className="text-xl font-extrabold text-neutral-900 dark:text-neutral-100">{p.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className={`text-3xl font-black sm:text-4xl ${featured ? "text-pink-600" : "text-neutral-900 dark:text-neutral-100"}`}>
                      {(period === "YEARLY" ? (p.yearlyPrice ?? p.price * 10) : p.price).toLocaleString("fa-IR")}
                    </span>
                    <span className="text-sm text-neutral-500">تومان</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {period === "YEARLY" ? "سالانه (۱۰ ماه با ۲ ماه تخفیف)" : "ماهانه"}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {(p.features ?? []).map((f, i) => (
                      <li key={f.key ?? `f-${i}`} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[12px] dark:bg-emerald-900/40" aria-hidden>
                          {f.icon}
                        </span>
                        <span>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <label className="text-xs font-medium text-neutral-500">درگاه پرداخت</label>
                    <select
                      value={gateway}
                      onChange={(e) => setGateway(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-3 text-sm outline-none transition focus:border-pink-400 focus:bg-white"
                    >
                      {gateways.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                          {g.sandbox ? " (تست)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => buy(p.id)}
                    disabled={buying === p.id || !gateway}
                    className={`mt-4 h-12 w-full rounded-2xl font-black transition disabled:opacity-50 ${
                      featured
                        ? "bg-gradient-to-l from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/25 hover:scale-[1.02]"
                        : "bg-neutral-900 text-white hover:bg-neutral-800"
                    }`}
                  >
                    {buying === p.id ? "در حال انتقال..." : "خرید پکیج"}
                  </button>
                </div>
              );
            })}
          </div>

          {error && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-center text-sm text-red-600">{error}</p>}
        </>
      )}

      <p className="mt-8 text-center text-sm text-neutral-400 sm:mt-12">
        برای ورود به حساب خود <Link href="/login" className="font-semibold text-pink-600">اینجا</Link> کلیک کنید.
      </p>
    </main>
  );
}
