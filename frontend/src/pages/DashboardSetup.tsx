"use client";

/**
 * ویزارد راه‌اندازی سالن — صفحهٔ مستقل و تمام‌صفحه (بدون منوی بالا/کنار).
 * اگر کاربر سالنی نداشته باشد، اولین مرحله ساخت سالن است؛ سپس مراحل
 * تکمیل (پروفایل، آنلاین، موقعیت، ساعات و قوانین، خدمات و کارکنان) ادامه می‌یابد.
 */
import { useEffect, useState } from "react";
import { Navigate, Link, useSearchParams } from "@/router-shim";
import { toPersianDigits } from "@/lib/utils";
import { useAuth } from "@/auth";

type SalonLite = {
  id: string;
  name: string;
  slug: string;
  phone: string;
  city?: string | null;
  address?: string | null;
  description?: string | null;
  instagram?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  mapUrl?: string | null;
  baladUrl?: string | null;
  neshanUrl?: string | null;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  cancelDeadlineHours?: number;
  bufferMinutes?: number;
};

type Service = { id: string; name: string; durationMin: number; price: number };
type StaffM = { id: string; name: string; title?: string | null };
type HourRow = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };

const DAY_LABELS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

const STEPS = [
  { label: "پروفایل کاری", icon: "👤" },
  { label: "لینک‌های آنلاین", icon: "🌐" },
  { label: "موقعیت مکانی", icon: "📍" },
  { label: "ساعات و قوانین", icon: "⏰" },
  { label: "خدمات و کارکنان", icon: "✂️" },
  { label: "پایان", icon: "🚀" },
];

async function reqJson(url: string, method: string, body?: unknown): Promise<any | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return await res.json();
  } catch {
    return null;
  }
}

// ساخت اسلاگ (نشانی عمومی) از نام سالن — همان منطق فینگلیش بکاند
const FA_TO_LATIN: Record<string, string> = {
  "آ": "a", "أ": "a", "إ": "i", "ا": "", "ب": "b", "پ": "p", "ت": "t", "ث": "s",
  "ج": "j", "چ": "ch", "ح": "h", "خ": "kh", "د": "d", "ذ": "z", "ر": "r", "ز": "z",
  "ژ": "zh", "س": "s", "ش": "sh", "ص": "s", "ض": "z", "ط": "t", "ظ": "z", "ع": "a",
  "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ک": "k", "گ": "g", "ل": "l", "م": "m",
  "ن": "n", "و": "v", "ه": "h", "ی": "i", "ي": "i", "ة": "h", "ئ": "y",
};

function makeSlug(name: string): string {
  let out = "";
  const s = String(name ?? "").toLowerCase();
  for (const ch of s) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (FA_TO_LATIN[ch] !== undefined) out += FA_TO_LATIN[ch];
    else if (/[\s._/\-\u200c\u200f]/.test(ch)) out += "-";
  }
  out = out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-+$/, "");
  if (out.length >= 2) return out;
  return `salon-${Math.random().toString(36).slice(2, 8)}`;
}

export default function DashboardSetup() {
  const { me } = useAuth();
  const sp = useSearchParams();
  // اگر کاربر «سالن جدید» را زده باشد (?new=1)، همیشه با فرم خالی شروع می‌شود
  const forceNew = sp.get("new") === "1";

  const [salons, setSalons] = useState<SalonLite[]>([]);
  const [loadingSalons, setLoadingSalons] = useState(true);
  const [salonId, setSalonId] = useState("");
  const [step, setStep] = useState(0);

  // ساخت سالن (وقتی سالنی نیست)
  const [create, setCreate] = useState({ name: "", phone: "", city: "", address: "" });
  const [creating, setCreating] = useState(false);

  // پروفایل + آنلاین + موقعیت
  const [base, setBase] = useState({
    name: "",
    phone: "",
    city: "",
    address: "",
    description: "",
    instagram: "",
    whatsapp: "",
    website: "",
    mapUrl: "",
    baladUrl: "",
    neshanUrl: "",
  });

  const [hours, setHours] = useState<HourRow[]>([]);
  const [rules, setRules] = useState({ minNoticeMinutes: 60, maxAdvanceDays: 30, cancelDeadlineHours: 24, bufferMinutes: 10 });

  const [services, setServices] = useState<Service[]>([]);
  const [svcName, setSvcName] = useState("");
  const [svcDur, setSvcDur] = useState("30");
  const [svcPrice, setSvcPrice] = useState("0");

  const [staff, setStaff] = useState<StaffM[]>([]);
  const [staffName, setStaffName] = useState("");
  const [staffTitle, setStaffTitle] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const salon = salons.find((s) => s.id === salonId);
  const baseUrl = salonId ? `/api/dashboard/salons/${salonId}` : "";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/salons")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list: SalonLite[] = d.success ? d.salons : [];
        setSalons(list);
        // در حالت «سالن جدید» سالن قبلی را انتخاب نمی‌کنیم تا فرم خالی بماند
        if (list.length && !forceNew) setSalonId(list[0].id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingSalons(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!salonId) return;
    setError("");
    (async () => {
      const [srv, stf, hrs] = await Promise.all([
        reqJson(`${baseUrl}/services`, "GET"),
        reqJson(`${baseUrl}/staff`, "GET"),
        reqJson(`${baseUrl}/hours`, "GET"),
      ]);
      if (srv?.success) setServices(srv.services as Service[]);
      if (stf?.success) setStaff(stf.staff as StaffM[]);
      if (hrs?.success && Array.isArray(hrs.hours)) {
        setHours(hrs.hours.map((h: HourRow) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: !!h.isClosed })));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonId]);

  useEffect(() => {
    if (salon) {
      setBase({
        name: salon.name,
        phone: salon.phone,
        city: salon.city ?? "",
        address: salon.address ?? "",
        description: salon.description ?? "",
        instagram: salon.instagram ?? "",
        whatsapp: salon.whatsapp ?? "",
        website: salon.website ?? "",
        mapUrl: salon.mapUrl ?? "",
        baladUrl: salon.baladUrl ?? "",
        neshanUrl: salon.neshanUrl ?? "",
      });
      setRules({
        minNoticeMinutes: salon.minNoticeMinutes ?? 60,
        maxAdvanceDays: salon.maxAdvanceDays ?? 30,
        cancelDeadlineHours: salon.cancelDeadlineHours ?? 24,
        bufferMinutes: salon.bufferMinutes ?? 10,
      });
    }
  }, [salon]);

  // پیش‌روی خودکار از مرحلهٔ اول وقتی فیلدهای الزامی پر شدند
  useEffect(() => {
    if (step !== 0) return;
    if (!base.name.trim() || !base.phone.trim()) return;
    const t = setTimeout(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 900);
    return () => clearTimeout(t);
  }, [step, base.name, base.phone]);

  if (!me) return <Navigate to="/login" replace />;
  if (loadingSalons) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100">
        <div className="text-center text-neutral-500">در حال بارگذاری…</div>
      </div>
    );
  }

  const input = "h-11 w-full rounded-xl border border-neutral-200 bg-white px-3.5 text-sm outline-none transition focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
  const label = "mb-1 block text-xs font-bold text-neutral-500 dark:text-neutral-400";
  const primaryBtn = "h-11 rounded-xl bg-[#1c2434] px-6 text-sm font-black text-white transition hover:bg-[#2a3450] disabled:opacity-50";

  async function createSalon() {
    if (!create.name.trim() || !create.phone.trim()) return setError("نام سالن و شماره تلفن الزامی است.");
    setCreating(true);
    setError("");
    const d = await reqJson("/api/salons", "POST", {
      name: create.name.trim(),
      phone: create.phone.trim(),
      city: create.city.trim(),
      address: create.address.trim(),
      // اسلاگ به‌صورت خودکار از نام ساخته می‌شود (برای سازگاری با بکاند)
      slug: makeSlug(create.name),
    });
    setCreating(false);
    if (d?.success && d.salon) {
      setSalons((prev) => (prev.some((s) => s.id === d.salon.id) ? prev : [...prev, d.salon]));
      setSalonId(d.salon.id);
    } else setError(d?.error || "خطا در ساخت سالن");
  }

  async function addService() {
    const dur = parseInt(svcDur, 10);
    const price = parseInt(svcPrice, 10);
    if (!svcName.trim() || !dur || !Number.isFinite(price)) return setError("نام، مدت و قیمت خدمت را درست وارد کنید");
    setBusy(true);
    const d = await reqJson(`${baseUrl}/services`, "POST", { name: svcName.trim(), durationMin: dur, price });
    setBusy(false);
    if (d?.success) {
      setServices((prev) => [...prev, d.service]);
      setSvcName("");
      setSvcDur("30");
      setSvcPrice("0");
    } else setError(d?.error || "خطا در افزودن خدمت");
  }

  async function deleteService(id: string) {
    const d = await reqJson(`${baseUrl}/services/${id}`, "DELETE");
    if (d?.success) setServices((prev) => prev.filter((x) => x.id !== id));
  }

  async function addStaff() {
    if (!staffName.trim()) return setError("نام کارکن را وارد کنید");
    setBusy(true);
    const d = await reqJson(`${baseUrl}/staff`, "POST", { name: staffName.trim(), title: staffTitle.trim() || undefined });
    setBusy(false);
    if (d?.success) {
      setStaff((prev) => [...prev, d.staff]);
      setStaffName("");
      setStaffTitle("");
    } else setError(d?.error || "خطا در افزودن کارکن");
  }

  async function deleteStaff(id: string) {
    const d = await reqJson(`${baseUrl}/staff/${id}`, "DELETE");
    if (d?.success) setStaff((prev) => prev.filter((x) => x.id !== id));
  }

  function setHour(index: number, patch: Partial<HourRow>) {
    setHours((prev) => prev.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  async function finishSetup() {
    if (!salonId) return;
    setBusy(true);
    setError("");
    const results = await Promise.all([
      reqJson(baseUrl, "PATCH", {
        name: base.name.trim(),
        phone: base.phone.trim(),
        city: base.city.trim(),
        address: base.address.trim(),
        description: base.description.trim(),
        instagram: base.instagram.trim(),
        whatsapp: base.whatsapp.trim(),
        website: base.website.trim(),
        mapUrl: base.mapUrl.trim(),
        baladUrl: base.baladUrl.trim(),
        neshanUrl: base.neshanUrl.trim(),
        minNoticeMinutes: Number(rules.minNoticeMinutes),
        maxAdvanceDays: Number(rules.maxAdvanceDays),
        cancelDeadlineHours: Number(rules.cancelDeadlineHours),
        bufferMinutes: Number(rules.bufferMinutes),
      }),
      hours.length
        ? reqJson(`${baseUrl}/hours`, "PUT", { days: hours.map((h) => ({ dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed })) })
        : Promise.resolve({ success: true }),
    ]);
    setBusy(false);
    if (results.every((r) => r?.success)) {
      window.location.href = "/dashboard/salon";
    } else {
      setError("خطا در ذخیره نهایی؛ دوباره تلاش کنید");
    }
  }

  const stepValid = [
    Boolean(base.name.trim() && base.phone.trim()),
    true,
    true,
    hours.length > 0,
    true,
    true,
  ];

  const defaultHours = () => DAY_LABELS.map((_, dayOfWeek) => ({ dayOfWeek, openTime: "10:00", closeTime: "20:00", isClosed: dayOfWeek === 6 }));

  // ─── صفحهٔ «ساخت سالن» (وقتی سالنی نیست یا کاربر «سالن جدید» خواسته) ───
  if (salons.length === 0 || (forceNew && !salonId)) {
    return (
      <div className="min-h-screen bg-neutral-100 px-4 py-10 dark:bg-neutral-950">
        <div className="mx-auto max-w-3xl">
          {/* برندینگ */}
          <div className="mb-8 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 text-2xl text-white shadow-lg">💈</div>
            <h1 className="mt-4 text-2xl font-black text-neutral-900 dark:text-neutral-100">راه‌اندازی سالن شما</h1>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">ابتدا سالن را بسازید؛ سپس مراحل تکمیل را ادامه دهید.</p>
          </div>

          {/* نوار پیشرفت */}
          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-neutral-500">
              <span>۰ از ۶</span>
              <span className="text-pink-600">💈 شروع</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div className="h-full w-1/6 rounded-full bg-gradient-to-l from-pink-500 to-purple-600" />
            </div>
          </div>

          {/* چیپ‌های مراحل */}
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            {STEPS.map((s) => (
              <span key={s.label} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-neutral-500 opacity-70 shadow-sm dark:bg-neutral-900 dark:text-neutral-400">
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </span>
            ))}
          </div>

          {/* کارت ساخت سالن */}
          <div className="step-enter rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="space-y-4">
              <div>
                <span className={label}>نام سالن *</span>
                <input className={input} placeholder="مثلاً آرایشگاه مهرازا" value={create.name} onChange={(e) => setCreate((c) => ({ ...c, name: e.target.value }))} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className={label}>شماره تلفن *</span>
                  <input className={input} dir="ltr" placeholder="02112345678" value={create.phone} onChange={(e) => setCreate((c) => ({ ...c, phone: e.target.value }))} />
                </div>
                <div>
                  <span className={label}>شهر</span>
                  <input className={input} placeholder="تهران" value={create.city} onChange={(e) => setCreate((c) => ({ ...c, city: e.target.value }))} />
                </div>
              </div>
              <div>
                <span className={label}>آدرس</span>
                <input className={input} placeholder="تهران، سعادت‌آباد..." value={create.address} onChange={(e) => setCreate((c) => ({ ...c, address: e.target.value }))} />
              </div>
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}
              <button onClick={createSalon} disabled={creating} className={`${primaryBtn} w-full`}>
                {creating ? "در حال ساخت..." : "ساخت سالن و ادامه"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── ویزارد مراحل (وقتی سالن داریم) ───
  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-10 dark:bg-neutral-950">
      <div className="mx-auto max-w-3xl">
        {/* برندینگ */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 text-2xl text-white shadow-lg">💈</div>
          <h1 className="mt-4 text-2xl font-black text-neutral-900 dark:text-neutral-100">راه‌اندازی {salon?.name}</h1>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">مراحل زیر را کامل کنید تا سالن شما آماده پذیرش نوبت شود.</p>
        </div>

        {/* نوار پیشرفت */}
        <div className="mb-6">
          <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-neutral-500">
            <span>{toPersianDigits(step + 1)} از {toPersianDigits(STEPS.length)}</span>
            <span className="text-pink-600">{STEPS[step].icon} {STEPS[step].label}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div className="h-full rounded-full bg-gradient-to-l from-pink-500 to-purple-600 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        {/* چیپ‌های مراحل */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <button key={s.label} onClick={() => setStep(i)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition ${i === step ? "bg-[#1c2434] text-white" : i < step ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-white text-neutral-500 shadow-sm hover:bg-neutral-50"}`}>
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}

        <div key={step} className="step-enter">
        {/* مرحله ۱: پروفایل */}
        {step === 0 && (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">پروفایل کاری</h3>
            <p className="mt-1 text-xs text-neutral-500">اطلاعات پایه سالن و تماس.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className={label}>نام سالن *</span>
                <input className={input} value={base.name} onChange={(e) => setBase((b) => ({ ...b, name: e.target.value }))} />
              </div>
              <div>
                <span className={label}>شماره تلفن *</span>
                <input className={input} dir="ltr" value={base.phone} onChange={(e) => setBase((b) => ({ ...b, phone: e.target.value }))} />
              </div>
              <div>
                <span className={label}>شهر</span>
                <input className={input} value={base.city} onChange={(e) => setBase((b) => ({ ...b, city: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <span className={label}>آدرس کامل</span>
                <input className={input} value={base.address} onChange={(e) => setBase((b) => ({ ...b, address: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <span className={label}>معرفی سالن</span>
                <textarea className={`${input} min-h-[80px]`} maxLength={2000} value={base.description} onChange={(e) => setBase((b) => ({ ...b, description: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        {/* مرحله ۲: آنلاین */}
        {step === 1 && (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">لینک‌های آنلاین</h3>
            <p className="mt-1 text-xs text-neutral-500">شبکه‌های اجتماعی و تماس‌های آنلاین.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className={label}>اینستاگرام</span>
                <input className={input} placeholder="@mahrazah" value={base.instagram} onChange={(e) => setBase((b) => ({ ...b, instagram: e.target.value }))} />
              </div>
              <div>
                <span className={label}>واتساپ</span>
                <input className={input} dir="ltr" value={base.whatsapp} onChange={(e) => setBase((b) => ({ ...b, whatsapp: e.target.value }))} />
              </div>
              <div>
                <span className={label}>سایت یا وبلاگ</span>
                <input className={input} dir="ltr" placeholder="https://..." value={base.website} onChange={(e) => setBase((b) => ({ ...b, website: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        {/* مرحله ۳: موقعیت */}
        {step === 2 && (
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">موقعیت مکانی</h3>
            <p className="mt-1 text-xs text-neutral-500">آدرس دقیق و لینک نقشه.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className={label}>آدرس پستی</span>
                <input className={input} value={base.address} onChange={(e) => setBase((b) => ({ ...b, address: e.target.value }))} />
              </div>
              <div>
                <span className={label}>لینک گوگل‌مپ</span>
                <input className={input} dir="ltr" value={base.mapUrl} onChange={(e) => setBase((b) => ({ ...b, mapUrl: e.target.value }))} />
              </div>
              <div>
                <span className={label}>لینک نشان</span>
                <input className={input} dir="ltr" value={base.neshanUrl} onChange={(e) => setBase((b) => ({ ...b, neshanUrl: e.target.value }))} />
              </div>
              <div>
                <span className={label}>لینک بلد</span>
                <input className={input} dir="ltr" value={base.baladUrl} onChange={(e) => setBase((b) => ({ ...b, baladUrl: e.target.value }))} />
              </div>
            </div>
          </div>
        )}

        {/* مرحله ۴: ساعات و قوانین */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">ساعات کاری</h3>
                <div className="flex gap-2">
                  <button onClick={() => setHours(defaultHours())} className="h-9 rounded-xl bg-neutral-100 px-3 text-xs font-bold text-neutral-600 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">پیش‌فرض</button>
                  <button onClick={() => setHours(DAY_LABELS.map((_, i) => ({ dayOfWeek: i, openTime: "09:00", closeTime: "21:00", isClosed: false })))} className="h-9 rounded-xl bg-neutral-100 px-3 text-xs font-bold text-neutral-600 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">پرکار</button>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {hours.map((h, i) => (
                  <div key={h.dayOfWeek} className="grid grid-cols-[110px_1fr_1fr_auto] items-center gap-2 rounded-xl border border-neutral-100 px-3 py-2.5 dark:border-neutral-800 sm:grid-cols-[120px_150px_150px_auto]">
                    <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200">{DAY_LABELS[h.dayOfWeek]}</span>
                    {h.isClosed ? <span className="col-span-2 text-sm text-neutral-400">تعطیل</span> : (
                      <>
                        <input type="time" className={input} value={h.openTime} onChange={(e) => setHour(i, { openTime: e.target.value })} />
                        <input type="time" className={input} value={h.closeTime} onChange={(e) => setHour(i, { closeTime: e.target.value })} />
                      </>
                    )}
                    <button onClick={() => setHour(i, { isClosed: !h.isClosed })} className={`h-9 rounded-xl px-3 text-xs font-bold transition ${h.isClosed ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"}`}>
                      {h.isClosed ? "فعال‌کردن" : "تعطیل"}
                    </button>
                  </div>
                ))}
                {hours.length === 0 && (
                  <button onClick={() => setHours(defaultHours())} className="w-full rounded-xl border border-dashed border-neutral-300 py-6 text-sm font-bold text-neutral-400">+ تعیین ساعات کاری</button>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">قوانین رزرو</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { key: "minNoticeMinutes" as const, label: "حداقل اطلاع قبلی (دقیقه)" },
                  { key: "maxAdvanceDays" as const, label: "حداکثر رزرو (روز)" },
                  { key: "cancelDeadlineHours" as const, label: "مهلت لغو (ساعت)" },
                  { key: "bufferMinutes" as const, label: "فاصله بین نوبت‌ها (دقیقه)" },
                ].map((f) => (
                  <div key={f.key}>
                    <span className={label}>{f.label}</span>
                    <input className={input} type="number" min={0} value={rules[f.key]} onChange={(e) => setRules((r) => ({ ...r, [f.key]: Number(e.target.value) }))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* مرحله ۵: خدمات و کارکنان */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">خدمات</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px_120px_auto]">
                <input className={input} placeholder="نام خدمت" value={svcName} onChange={(e) => setSvcName(e.target.value)} />
                <input className={input} placeholder="مدت (دقیقه)" type="number" min={5} value={svcDur} onChange={(e) => setSvcDur(e.target.value)} />
                <input className={input} placeholder="قیمت (تومان)" dir="ltr" type="number" min={0} value={svcPrice} onChange={(e) => setSvcPrice(e.target.value)} />
                <button onClick={addService} disabled={busy} className="h-11 rounded-xl bg-pink-600 px-5 text-sm font-black text-white transition hover:bg-pink-700 disabled:opacity-50">+ افزودن</button>
              </div>
              {services.length === 0 ? (
                <p className="mt-5 rounded-xl bg-neutral-50 py-8 text-center text-sm text-neutral-400 dark:bg-neutral-800">هنوز خدمتی ثبت نشده است.</p>
              ) : (
                <div className="mt-5 space-y-2">
                  {services.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-4 py-3 dark:border-neutral-800">
                      <div>
                        <div className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{s.name}</div>
                        <div className="text-xs text-neutral-500">{toPersianDigits(s.durationMin)} دقیقه · {s.price.toLocaleString("fa-IR")} تومان</div>
                      </div>
                      <button onClick={() => deleteService(s.id)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400">حذف</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
              <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">کارکنان</h3>
              <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <input className={input} placeholder="نام و نام خانوادگی" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
                <input className={input} placeholder="سمت (اختیاری)" value={staffTitle} onChange={(e) => setStaffTitle(e.target.value)} />
                <button onClick={addStaff} disabled={busy} className="h-11 rounded-xl bg-pink-600 px-5 text-sm font-black text-white transition hover:bg-pink-700 disabled:opacity-50">+ افزودن</button>
              </div>
              {staff.length === 0 ? (
                <p className="mt-5 rounded-xl bg-neutral-50 py-8 text-center text-sm text-neutral-400 dark:bg-neutral-800">هنوز کارکنی ثبت نشده است.</p>
              ) : (
                <div className="mt-5 space-y-2">
                  {staff.map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-4 py-3 dark:border-neutral-800">
                      <div>
                        <div className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{x.name}</div>
                        {x.title && <div className="text-xs text-neutral-500">{x.title}</div>}
                      </div>
                      <button onClick={() => deleteStaff(x.id)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400">حذف</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* مرحله ۶: پایان */}
        {step === 5 && salon && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-8 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="text-4xl">🎉</div>
            <div className="mt-3 text-xl font-black text-emerald-800 dark:text-emerald-300">تقریباً آماده‌اید!</div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              سالن «{salon.name}» با {toPersianDigits(services.length)} خدمت و {toPersianDigits(staff.length)} کارکن، اکنون آماده پذیرش نوبت است.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={`/s/${salon.slug}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-pink-600 px-6 text-sm font-black text-white transition hover:bg-pink-700">مشاهده صفحه عمومی</Link>
              <Link href="/dashboard/salon" className="inline-flex h-11 items-center gap-2 rounded-xl border border-neutral-300 bg-white px-6 text-sm font-black text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">رفتن به داشبورد سالن</Link>
            </div>
          </div>
        )}
        </div>

        {/* ناوبری */}
        <div className="mt-6 flex items-center justify-between">
          <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="h-11 rounded-xl border border-neutral-300 bg-white px-5 text-sm font-bold text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            ← قبلی
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!stepValid[step]}
              className="h-11 rounded-xl bg-[#1c2434] px-6 text-sm font-black text-white transition hover:bg-[#2a3450] disabled:opacity-40"
            >
              بعدی →
            </button>
          ) : (
            <button onClick={finishSetup} disabled={busy} className="h-11 rounded-xl bg-emerald-600 px-6 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50">
              {busy ? "در حال ذخیره..." : "ذخیره و شروع کار با سالن"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
