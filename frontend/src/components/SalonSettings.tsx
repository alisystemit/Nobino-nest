"use client";

import { useEffect, useState } from "react";
import SalonIcon from "@/components/icons/SalonIcon";
import TimeField from "@/components/ui/TimeField";

type Salon = {
  id: string;
  name: string;
  slug: string;
  phone: string;
  city: string | null;
  address: string | null;
  description: string | null;
  coverColor: string;
  isActive: boolean;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  customDomain?: string | null;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  cancelDeadlineHours?: number;
  bufferMinutes?: number;
};

type Hour = { id: string; dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };

const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export default function SalonSettings({ salon }: { salon: Salon }) {
  const [form, setForm] = useState({
    name: salon.name,
    phone: salon.phone,
    city: salon.city ?? "",
    address: salon.address ?? "",
    description: salon.description ?? "",
    coverColor: salon.coverColor,
    timezone: salon.timezone ?? "Asia/Tehran",
    latitude: salon.latitude ?? "",
    longitude: salon.longitude ?? "",
    customDomain: salon.customDomain ?? "",
    minNoticeMinutes: salon.minNoticeMinutes ?? 60,
    maxAdvanceDays: salon.maxAdvanceDays ?? 30,
    cancelDeadlineHours: salon.cancelDeadlineHours ?? 24,
    bufferMinutes: salon.bufferMinutes ?? 10,
  });
  const [hours, setHours] = useState<Hour[]>([]);
  const [logoUrl, setLogoUrl] = useState(salon.logoUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(salon.bannerUrl ?? "");
  const [gallery, setGallery] = useState<{ id: string; imageUrl: string; title?: string | null }[]>([]);
  const [galleryTitle, setGalleryTitle] = useState("");
  const [uploading, setUploading] = useState<"logo" | "banner" | "gallery" | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function loadImages() {
    try {
      const res = await fetch(`/api/dashboard/salons/${salon.id}/images`);
      const data = await res.json();
      if (data.success) setGallery(data.items ?? []);
    } catch {
      /* بی‌صدا */
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/salons/${salon.id}/images`);
        const data = await res.json();
        if (!cancelled && data.success) setGallery(data.items ?? []);
      } catch {
        /* بی‌صدا */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [salon.id]);

  async function uploadImage(kind: "logo" | "banner" | "gallery", file: File) {
    setUploading(kind);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      if (kind === "gallery" && galleryTitle.trim()) fd.append("title", galleryTitle.trim());
      const res = await fetch(`/api/dashboard/salons/${salon.id}/images`, { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "بارگذاری ناموفق بود");
      if (kind === "logo") setLogoUrl(data.url);
      else if (kind === "banner") setBannerUrl(data.url);
      else {
        setGalleryTitle("");
        loadImages();
      }
      setMsg({ ok: true, text: "تصویر با موفقیت بارگذاری شد ✅" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا در بارگذاری تصویر" });
    } finally {
      setUploading(null);
    }
  }

  async function removeGalleryItem(itemId: string) {
    const res = await fetch(`/api/dashboard/salons/${salon.id}/images?itemId=${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (data.success) loadImages();
    else setMsg({ ok: false, text: data.error || "حذف ناموفق بود" });
  }

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/dashboard/salons/${salon.id}/hours`);
      const data = await res.json();
      if (data.success) setHours(data.hours);
    })();
  }, [salon.id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function setHour(day: number, patch: Partial<Hour>) {
    setHours((hs) => hs.map((h) => (h.dayOfWeek === day ? { ...h, ...patch } : h)));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/dashboard/salons/${salon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          city: form.city,
          address: form.address,
          description: form.description,
          coverColor: form.coverColor,
          timezone: form.timezone,
          latitude: form.latitude === "" ? null : Number(form.latitude),
          longitude: form.longitude === "" ? null : Number(form.longitude),
          customDomain: form.customDomain || null,
          minNoticeMinutes: Number(form.minNoticeMinutes),
          maxAdvanceDays: Number(form.maxAdvanceDays),
          cancelDeadlineHours: Number(form.cancelDeadlineHours),
          bufferMinutes: Number(form.bufferMinutes),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "خطا");

      if (hours.length > 0) {
        await fetch(`/api/dashboard/salons/${salon.id}/hours`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days: hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed })) }),
        });
      }

      setMsg({ ok: true, text: "ذخیره شد ✅" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا" });
    } finally {
      setSaving(false);
    }
  }

  const input =
    "h-11 w-full rounded-xl border border-neutral-300 bg-white px-3.5 text-sm outline-none transition focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="space-y-5">
      {/* تصاویر سالن */}
      <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">تصاویر سالن</h3>
        <p className="mt-1 text-[11px] text-neutral-400">لوگو و بنر در صفحه عمومی سالن نمایش داده می‌شوند (حداکثر ۵ مگابایت).</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="لوگوی سالن" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center"><SalonIcon className="h-8 w-8 text-neutral-300" /></span>
              )}
            </div>
            <label className="mt-2 flex h-10 cursor-pointer items-center justify-center rounded-lg bg-neutral-100 text-center text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
              {uploading === "logo" ? "در حال بارگذاری..." : "انتخاب لوگو"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage("logo", f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div>
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
              {bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bannerUrl} alt="بنر سالن" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-neutral-400">بدون بنر</span>
              )}
            </div>
            <label className="mt-2 flex h-10 cursor-pointer items-center justify-center rounded-lg bg-neutral-100 text-center text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
              {uploading === "banner" ? "در حال بارگذاری..." : "انتخاب بنر"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage("banner", f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-neutral-700 dark:text-neutral-200">گالری نمونه‌کارها</h4>
            <span className="text-[11px] text-neutral-400">{gallery.length.toLocaleString("fa-IR")} تصویر</span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {gallery.map((g) => (
              <div key={g.id} className="group relative aspect-square overflow-hidden rounded-xl bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.imageUrl} alt={g.title ?? "نمونه‌کار"} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeGalleryItem(g.id)}
                  className="absolute left-1 top-1 flex h-8 items-center justify-center rounded-lg bg-black/65 px-2 text-[10px] font-bold text-white transition sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="حذف تصویر"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className={input}
              placeholder="عنوان تصویر (اختیاری)"
              value={galleryTitle}
              onChange={(e) => setGalleryTitle(e.target.value)}
              maxLength={80}
            />
            <label className="flex h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-xl bg-neutral-900 px-4 text-center text-sm font-bold text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white">
              {uploading === "gallery" ? "در حال بارگذاری..." : "افزودن تصویر"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage("gallery", f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">نام سالن</label>
        <input className={input} value={form.name} onChange={set("name")} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">تلفن</label>
          <input className={input} dir="ltr" value={form.phone} onChange={set("phone")} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">شهر</label>
          <input className={input} value={form.city} onChange={set("city")} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">آدرس</label>
        <input className={input} value={form.address} onChange={set("address")} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">توضیحات</label>
        <textarea className={`${input} min-h-[80px]`} value={form.description} onChange={set("description")} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">رنگ زمینه</label>
        <input type="color" className="h-11 w-full cursor-pointer rounded-xl border border-neutral-300" value={form.coverColor} onChange={set("coverColor")} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">منطقه زمانی</label>
        <input className={input} value={form.timezone} onChange={set("timezone")} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">عرض جغرافیایی</label>
          <input className={input} dir="ltr" value={form.latitude} onChange={set("latitude")} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">طول جغرافیایی</label>
          <input className={input} dir="ltr" value={form.longitude} onChange={set("longitude")} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">دامنه اختصاصی (برای پلن سازمانی)</label>
        <input className={input} dir="ltr" placeholder="salon.com" value={form.customDomain} onChange={set("customDomain")} />
        <p className="mt-1 text-[11px] text-neutral-400">باید DNS دامنه به این سرویس اشاره کند.</p>
      </div>

      {/* قوانین رزرو */}
      <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">قوانین رزرو</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">حداقل فاصله تا رزرو (دقیقه)</label>
            <input type="number" className={input} value={form.minNoticeMinutes} onChange={set("minNoticeMinutes")} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">حداکثر بازه آینده (روز)</label>
            <input type="number" className={input} value={form.maxAdvanceDays} onChange={set("maxAdvanceDays")} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">مهلت لغو (ساعت قبل از نوبت)</label>
            <input type="number" className={input} value={form.cancelDeadlineHours} onChange={set("cancelDeadlineHours")} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">بافر بین نوبت‌ها (دقیقه)</label>
            <input type="number" className={input} value={form.bufferMinutes} onChange={set("bufferMinutes")} />
          </div>
        </div>
      </div>

      {/* ساعات کاری */}
      <div className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">ساعات کاری هفتگی</h3>
        <div className="mt-3 space-y-2">
          {hours.map((h) => (
            <div
              key={h.dayOfWeek}
              className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-2.5 sm:grid sm:grid-cols-[80px_1fr_1fr_64px] sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 dark:border-neutral-800 dark:bg-neutral-800/40 sm:dark:bg-transparent"
            >
              <div className="flex items-center justify-between gap-2 sm:block">
                <span className="text-xs font-black text-neutral-700 dark:text-neutral-200">{DAY_NAMES[h.dayOfWeek]}</span>
                <label className="flex items-center gap-1 text-[11px] text-neutral-500 sm:hidden">
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-pink-600" checked={h.isClosed} onChange={(e) => setHour(h.dayOfWeek, { isClosed: e.target.checked })} />
                  تعطیل
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-0 sm:contents">
                <TimeField value={h.openTime} disabled={h.isClosed} onChange={(v) => setHour(h.dayOfWeek, { openTime: v })} />
                <TimeField value={h.closeTime} disabled={h.isClosed} onChange={(v) => setHour(h.dayOfWeek, { closeTime: v })} />
              </div>
              <label className="hidden items-center gap-1 text-xs text-neutral-500 sm:flex">
                <input type="checkbox" className="h-5 w-5 shrink-0 accent-pink-600" checked={h.isClosed} onChange={(e) => setHour(h.dayOfWeek, { isClosed: e.target.checked })} />
                تعطیل
              </label>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="h-12 w-full rounded-xl bg-pink-600 font-black text-white shadow-lg shadow-pink-500/20 transition hover:bg-pink-700 disabled:opacity-50"
      >
        {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
      </button>

      {msg && (
        <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
