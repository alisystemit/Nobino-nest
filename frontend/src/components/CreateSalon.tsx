"use client";

/**
 * فرم «ساخت سالن» — در کنار ساخت، امکان تنظیم و ویرایش سالن موجود را هم دارد:
 * اگر prop سالن داده شود، فرم با دادهٔ همان سالن پر می‌شود و ذخیره با
 * PATCH روی /api/dashboard/salons/:id انجام می‌گیرد.
 * لینک‌های نقشه (گوگل/بلد/نشان) هم در همین فرم قابل تنظیم هستند تا صفحهٔ
 * عمومی سالن دکمه‌های پویای «باز کردن در بلد/نشان» را از همان مقدارها بسازد.
 */
import { useState } from "react";
import { useRouter, Link } from "@/router-shim";

export type EditableSalon = {
  id: string;
  name: string;
  slug: string;
  phone: string;
  email?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  city?: string | null;
  address?: string | null;
  description?: string | null;
  instagram?: string | null;
  mapUrl?: string | null;
  baladUrl?: string | null;
  neshanUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  coverColor?: string | null;
};

const randomCoverColor = (): string =>
  `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`;

export default function CreateSalon({ salon }: { salon?: EditableSalon | null }) {
  const router = useRouter();
  const editing = Boolean(salon?.id);
  const [form, setForm] = useState({
    name: salon?.name ?? "",
    phone: salon?.phone ?? "",
    email: salon?.email ?? "",
    whatsapp: salon?.whatsapp ?? "",
    website: salon?.website ?? "",
    city: salon?.city ?? "",
    address: salon?.address ?? "",
    description: salon?.description ?? "",
    instagram: salon?.instagram ?? "",
    mapUrl: salon?.mapUrl ?? "",
    baladUrl: salon?.baladUrl ?? "",
    neshanUrl: salon?.neshanUrl ?? "",
    // رنگ زمینه به‌صورت خودکار تصادفی انتخاب می‌شود (بدون انتخاب دستی)
    coverColor: salon?.coverColor ?? randomCoverColor(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      const common = {
        name: form.name,
        phone: form.phone,
        city: form.city,
        address: form.address,
        description: form.description,
        mapUrl: form.mapUrl.trim() || null,
        baladUrl: form.baladUrl.trim() || null,
        neshanUrl: form.neshanUrl.trim() || null,
        coverColor: form.coverColor || "#ec4899",
      };

      if (editing) {
        // ویرایش تنظیمات سالن موجود — اسلاگ (آدرس عمومی) قابل تغییر نیست
        const res = await fetch(`/api/dashboard/salons/${salon!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...common,
            email: form.email.trim() || null,
            whatsapp: form.whatsapp.trim() || null,
            website: form.website.trim() || null,
            instagram: form.instagram || null,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "ذخیره تغییرات ناموفق بود");
        setMsg("ذخیره شد ✅");
      } else {
        const res = await fetch("/api/salons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...common,
            // شمای ساخت null نمی‌پذیرد؛ فیلد خالی حذف می‌شود
            email: form.email.trim() || undefined,
            whatsapp: form.whatsapp.trim() || undefined,
            website: form.website.trim() || undefined,
            instagram: form.instagram || undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "خطا");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setLoading(false);
    }
  }

  const input =
    "h-11 w-full rounded-xl border border-neutral-300 bg-white px-3.5 text-sm outline-none transition focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="space-y-4">
      <input className={input} placeholder="نام سالن" value={form.name} onChange={set("name")} />
      <input className={input} placeholder="تلفن" dir="ltr" value={form.phone} onChange={set("phone")} />
      <input className={input} placeholder="شهر" value={form.city} onChange={set("city")} />
      <input className={input} placeholder="آدرس" value={form.address} onChange={set("address")} />
      <input className={input} dir="ltr" placeholder="لینک نقشه (اختیاری)" value={form.mapUrl} onChange={set("mapUrl")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className={input}
          dir="ltr"
          placeholder="لینک بلد (اختیاری)"
          value={form.baladUrl}
          onChange={set("baladUrl")}
        />
        <input
          className={input}
          dir="ltr"
          placeholder="لینک نشان (اختیاری)"
          value={form.neshanUrl}
          onChange={set("neshanUrl")}
        />
      </div>
      <p className="text-[11px] text-neutral-400">
        لینک‌های بالا، دکمه‌های «باز کردن در نشان / بلد» صفحهٔ عمومی سالن را می‌سازند؛ خالی بگذارید، از نام و آدرس ساخته می‌شوند.
      </p>
      <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
        <p className="mb-2 text-xs font-extrabold text-neutral-600 dark:text-neutral-300">راه‌های ارتباطی</p>
        <div className="space-y-3">
          <input className={input} dir="ltr" placeholder="ایمیل (اختیاری)" value={form.email} onChange={set("email")} />
          <input className={input} dir="ltr" placeholder="واتساپ (اختیاری)" value={form.whatsapp} onChange={set("whatsapp")} />
          <input className={input} dir="ltr" placeholder="وب‌سایت (اختیاری)" value={form.website} onChange={set("website")} />
          <input className={input} dir="ltr" placeholder="صفحه اینستاگرام (اختیاری)" value={form.instagram} onChange={set("instagram")} />
        </div>
      </div>
      <textarea className={`${input} min-h-[80px]`} placeholder="توضیحات درباره سالن" value={form.description} onChange={set("description")} />
      <Link href="/help#owner" className="block text-center text-xs font-bold text-pink-600 hover:underline">
        📘 راهنمای کامل ساخت سالن و گرفتن لینک بلد و نشان
      </Link>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
      {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{msg}</p>}
      <button
        onClick={submit}
        disabled={loading || !form.name || !form.phone}
        className="h-12 w-full rounded-xl bg-pink-600 font-black text-white shadow-lg shadow-pink-500/20 transition hover:bg-pink-700 disabled:opacity-50"
      >
        {loading ? (editing ? "در حال ذخیره..." : "در حال ساخت...") : editing ? "ذخیره تغییرات" : "ساخت سالن"}
      </button>
    </div>
  );
}
