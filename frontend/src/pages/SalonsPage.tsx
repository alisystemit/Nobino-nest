/**
 * فهرست عمومی سالن‌ها (مسیر /salons).
 *
 * این صفحه در بازسازی داشبورد (کامیت 5b73260) حذف شد ولی شش لینک به آن باقی ماند
 * و بی‌صدا به «/» برمی‌گشتند. داده از `/api/salons/search` (عمومی، صفحه‌بندی‌شده)
 * خوانده می‌شود و کارت‌ها همان دو فرم آدرس را دارند: ساب‌دامین سالن و /s/<slug>.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/router-shim";
import { MapPin, Search, Star } from "lucide-react";
import Pagination from "@/components/ui/Pagination";
import SafeImage from "@/components/SafeImage";
import SalonIcon from "@/components/icons/SalonIcon";
import { formatToman, toPersianDigits } from "@/lib/utils";
import { subdomainUrl } from "@/lib/subdomain";

/** هم‌راستا با پیش‌فرض سرور (getPagination: 50) — اینجا فهرست فشرده‌تر نمایش داده می‌شود */
const PAGE_SIZE = 12;

type SearchSalon = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  description: string | null;
  coverColor: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  rating: number | null;
  reviewCount: number;
};

function joinLocation(city?: string | null, address?: string | null): string {
  return [city, address].filter(Boolean).join(" — ") || "بدون آدرس ثبت‌شده";
}

export default function SalonsPage() {
  const [salons, setSalons] = useState<SearchSalon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [service, setService] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  // تایپ آزاد را debounce می‌کنیم تا هر کلید یک درخواست نزند
  const debounced = useMemo(() => q.trim(), [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (debounced) params.set("q", debounced);
      if (city.trim()) params.set("city", city.trim());
      if (service.trim()) params.set("service", service.trim());
      const price = Number(maxPrice);
      if (Number.isFinite(price) && price > 0) params.set("maxPrice", String(Math.round(price)));
      const res = await fetch(`/api/salons/search?${params.toString()}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "خطا در دریافت سالن‌ها");
      setSalons((data.salons ?? []) as SearchSalon[]);
      setTotal(data.total ?? 0);
      setTotalPages(Math.max(1, Number(data.totalPages ?? 1)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }, [page, debounced, city, service, maxPrice]);

  useEffect(() => {
    const id = setTimeout(() => void load(), page === 1 ? 0 : 250);
    return () => clearTimeout(id);
  }, [load, page]);

  // هر فیلتر جدید باید فهرست را به صفحهٔ اول برگرداند
  useEffect(() => {
    setPage(1);
  }, [debounced, city, service, maxPrice]);

  const inputCls =
    "h-11 w-full rounded-xl border border-neutral-200 bg-white px-4 text-sm outline-none transition focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-100 sm:text-3xl">جستجوی سالن‌های زیبایی</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          بر اساس نام سالن، شهر، خدمت یا سقف قیمت بگردید؛ {toPersianDigits(total)} سالن یافت شد.
        </p>
      </header>

      <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative block">
            <span className="sr-only">نام سالن یا آدرس</span>
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="نام سالن، شهر یا آدرس"
              className={`${inputCls} pr-10`}
            />
          </label>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="شهر" className={inputCls} />
          <input value={service} onChange={(e) => setService(e.target.value)} placeholder="نام خدمت (مثلاً رنگ مو)" className={inputCls} />
          <input
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="حداکثر قیمت (تومان)"
            className={inputCls}
            dir="ltr"
          />
        </div>
      </section>

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && salons.length === 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-56 animate-pulse rounded-3xl bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      ) : salons.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-neutral-300 p-12 text-center text-neutral-500 dark:border-neutral-700">
          سالنی با این مشخصات پیدا نشد. فیلترها را ساده‌تر کنید.
        </div>
      ) : (
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {salons.map((s) => (
            <Link
              key={s.id}
              href={subdomainUrl(s.slug)}
              className="group overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="relative h-36 overflow-hidden" style={{ background: `linear-gradient(135deg, ${s.coverColor || "#ec4899"}, #7c3aed)` }}>
                <SafeImage
                  src={s.bannerUrl ?? "/seed/hero.svg"}
                  alt={s.name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  fallback={<SalonIcon className="h-10 w-10 opacity-60" />}
                  fallbackClassName="absolute inset-0 !bg-transparent"
                />
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold text-neutral-700 backdrop-blur">
                  <MapPin className="h-3 w-3" /> {s.city ?? "سالن زیبایی"}
                </span>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">{s.name}</h2>
                  {s.rating != null && (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      <Star className="ml-0.5 inline h-3 w-3" />
                      {toPersianDigits(s.rating.toFixed(1))} ({toPersianDigits(s.reviewCount)})
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">📍 {joinLocation(s.city, s.address)}</p>
                {s.description && <p className="mt-2 line-clamp-2 text-sm text-neutral-400 dark:text-neutral-500">{s.description}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-pink-50 px-2.5 py-0.5 text-[10px] font-bold text-pink-700 dark:bg-pink-950/40 dark:text-pink-300">
                    مشاهدهٔ خدمات و رزرو آنلاین
                  </span>
                  {s.reviewCount > 0 && (
                    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {toPersianDigits(s.reviewCount)} نظر ثبت‌شده
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </main>
  );
}
