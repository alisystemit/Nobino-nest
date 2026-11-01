"use client";

import { useEffect, useState } from "react";
import { Link } from "@/next";
import SalonIcon from "@/components/icons/SalonIcon";

type Salon = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  coverColor: string;
  description: string | null;
  rating: number | null;
  reviewCount: number;
};

function joinLocation(city: string | null | undefined, address: string | null | undefined): string {
  const c = (city ?? "").trim();
  const a = (address ?? "").trim();
  if (!c) return a || "—";
  if (!a) return c;
  const a2 = (a.startsWith(c + "،") ? a.slice(c.length + 1) : a.startsWith(c + ",") ? a.slice(c.length + 1) : a).trim();
  return a2 ? `${c} — ${a2}` : c;
}

export default function SalonsDirectoryPage() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [service, setService] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function fetchSalons() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (city) params.set("city", city);
    if (service) params.set("service", service);
    if (maxPrice) params.set("maxPrice", maxPrice);
    return fetch(`/api/salons/search?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error || "خطا");
        setSalons(data.salons);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "خطا");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  async function search() {
    setLoading(true);
    setError("");
    await fetchSalons();
  }

  useEffect(() => {
    fetchSalons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const input = "w-full rounded-xl border border-neutral-300 bg-neutral-50/60 px-4 py-3 text-sm outline-none transition focus:border-pink-400 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:focus:bg-neutral-800";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-black text-neutral-900 sm:text-3xl dark:text-neutral-100">جستجوی آرایشگاه‌ها</h1>
      <p className="mt-2 text-sm text-neutral-500 sm:text-base dark:text-neutral-400">بر اساس منطقه، خدمت و قیمت، سالن مناسب خود را پیدا کنید.</p>

      {/* Search bar */}
      <div className="mt-5 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm sm:mt-8 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <input className={input} placeholder="نام سالن..." value={q} onChange={(e) => setQ(e.target.value)} />
          <input className={input} placeholder="شهر..." value={city} onChange={(e) => setCity(e.target.value)} />
          <input className={input} placeholder="خدمت (مثلاً رنگ مو)..." value={service} onChange={(e) => setService(e.target.value)} />
          <input className={input} type="number" placeholder="حداکثر قیمت (تومان)" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
          <button onClick={search} className="h-12 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-6 font-bold text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.02]">
            جستجو
          </button>
        </div>
      </div>

      {error && <p className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
      {loading && <p className="mt-12 text-center text-neutral-400">در حال جستجو...</p>}

      {/* Results */}
      <div className="mt-6 grid gap-4 sm:mt-8 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
        {!loading &&
          salons.map((s) => (
            <Link
              key={s.id}
              href={`/s/${s.slug}`}
              className="group overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex h-28 items-center justify-center sm:h-32" style={{ background: `linear-gradient(135deg, ${s.coverColor}, #7c3aed)` }}>
                <SalonIcon className="h-14 w-14 text-white/90 sm:h-16 sm:w-16" />
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">{s.name}</h3>
                  {s.rating != null && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      ★ {s.rating.toFixed(1)} ({s.reviewCount})
                    </span>
                  )}
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
                  <span aria-hidden>📍</span>
                  {joinLocation(s.city, s.address)}
                </p>
                {s.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-neutral-400 dark:text-neutral-500">{s.description}</p>
                )}
              </div>
            </Link>
          ))}
      </div>

      {!loading && salons.length === 0 && (
        <p className="mt-12 rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-neutral-400">
          سالنی مطابق فیلترها یافت نشد.
        </p>
      )}
    </main>
  );
}
