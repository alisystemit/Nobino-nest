"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/router-shim";
import { CalendarPlus, Info, Mic, PhoneCall, Users } from "lucide-react";
import { PanelCard } from "@/components/ui/Stats";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";
import TimeField from "@/components/ui/TimeField";
import { todayInZone, zonedTimeToIso } from "@/lib/time/zoned";

type Service = { id: string; name: string; durationMin: number; price: number };
type Staff = { id: string; name: string; title?: string | null };
type Branch = { id: string; name: string };

/**
 * رزرو دستی نوبت — کاملاً جدا از جریان صوتی.
 * ثبت نهایی از `POST /api/appointments` و در سرویس‌لایر `createAppointmentSafe`
 * انجام می‌شود (قفل FOR UPDATE روی سالن)، پس تداخل زمانی در سمت فرانت بررسی نمی‌شود.
 */
export default function ManualBooking({ salonId, timezone }: { salonId: string; timezone?: string }) {
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const [serviceId, setServiceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const [s, st, b] = await Promise.all([
        fetch(`/api/dashboard/salons/${salonId}/services`).then((r) => r.json()),
        fetch(`/api/dashboard/salons/${salonId}/staff`).then((r) => r.json()),
        fetch(`/api/dashboard/salons/${salonId}/branches`).then((r) => r.json()),
      ]);
      if (s.success) setServices(s.services);
      if (st.success) setStaff(st.staff);
      if (b.success) setBranches(b.branches);
    })();
  }, [salonId]);

  // «امروز» به وقت سالن، نه UTC/مرورگر — تا `min` تاریخ برای همه درست باشد
  const today = useMemo(() => todayInZone(timezone), [timezone]);
  const picked = services.find((s) => s.id === serviceId);

  const input =
    "h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-3 text-sm outline-none transition focus:border-pink-400 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800 dark:focus:bg-neutral-900";
  const label = "mb-1 block text-[11px] font-black text-neutral-500 dark:text-neutral-400";

  async function submit() {
    if (!name.trim() || !phone.trim() || !date || !time) {
      setMsg({ ok: false, text: "نام، شماره موبایل، تاریخ و ساعت الزامی است." });
      return;
    }
    setProcessing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          serviceId: serviceId || undefined,
          employeeId: employeeId || undefined,
          branchId: branchId || undefined,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          // ساعت سالن (نه ساعت مرورگر) — وگرنه نوبت چند ساعت جابه‌جا و رد می‌شود
          startAt: zonedTimeToIso(date, time, timezone),
          // کانال به‌صورت خودکار MANUAL است (پیش‌فرض سرور)
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "خطا در ثبت نوبت");
      setMsg({ ok: true, text: `✅ نوبت ${name.trim()} برای ${date} ساعت ${time} ثبت شد.` });
      setName("");
      setPhone("");
      setDate("");
      setTime("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا در ثبت نوبت" });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
      <PanelCard
        title="ثبت دستی نوبت"
        subtitle="ورود اطلاعات نوبت توسط آرایشگر — بدون صوت و هوش مصنوعی"
        icon={<PhoneCall className="h-5 w-5" />}
      >
        <div className="space-y-3">
          <div>
            <span className={label}>خدمت</span>
            <select className={input} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">— انتخاب خدمت —</option>
              {services.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.durationMin} دقیقه)
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className={label}>نام مشتری</span>
              <input className={input} placeholder="مثلاً سارا احمدی" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <span className={label}>شماره موبایل</span>
              <input className={`${input} text-center`} dir="ltr" placeholder="09123456789" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <JalaliDatePicker label="تاریخ (شمسی)" value={date} onChange={setDate} min={today} timeZone={timezone} />
            <TimeField label="ساعت شروع" value={time} onChange={setTime} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {staff.length > 0 && (
              <div>
                <span className={label}>آرایشگر (اختیاری)</span>
                <select className={input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">— بدون تخصیص —</option>
                  {staff.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.title ? ` — ${x.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {branches.length > 1 && (
              <div>
                <span className={label}>شعبه</span>
                <select className={input} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">— شعبهٔ اصلی —</option>
                  {branches.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <button
            onClick={submit}
            disabled={processing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1c2434] font-black text-white shadow-lg transition hover:bg-[#2a3450] disabled:opacity-50"
          >
            <CalendarPlus className="h-4 w-4" />
            {processing ? "در حال ثبت..." : "ثبت نوبت دستی"}
          </button>

          {msg && (
            <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"}`}>
              {msg.text}
            </p>
          )}
        </div>
      </PanelCard>

      <PanelCard
        title="راهنمای ثبت دستی"
        subtitle="تفاوت این صفحه با رزرو صوتی"
        icon={<Info className="h-5 w-5" />}
        className="self-start"
      >
        <ul className="space-y-2.5 text-xs leading-6 text-neutral-600 dark:text-neutral-300">
          <li className="flex gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-pink-500" />
            برای مشتری‌هایی که تلفنی زنگ می‌زنند یا حضوری می‌آیند؛ فقط اطلاعات را تایپ کنید.
          </li>
          <li className="flex gap-2">
            <CalendarPlus className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
            تداخل زمانی و سقف رزرو در سرور بررسی می‌شود؛ اگر ساعت پر باشد خطای دقیق را همین‌جا می‌بینید.
          </li>
          <li className="flex gap-2">
            <Mic className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" />
            اگر می‌خواهید گفتار مشتری خودش فرم را پر کند، از «رزرو صوتی هوشمند» استفاده کنید.
          </li>
        </ul>

        {picked && (
          <div className="mt-4 rounded-2xl border border-pink-200 bg-pink-50/60 p-4 text-xs dark:border-pink-900 dark:bg-pink-950/20">
            <div className="font-black text-pink-700 dark:text-pink-300">{picked.name}</div>
            <div className="mt-1 text-neutral-600 dark:text-neutral-300">
              مدت: {picked.durationMin} دقیقه — قیمت: {picked.price.toLocaleString("fa-IR")} تومان
            </div>
            <div className="mt-1 text-neutral-500 dark:text-neutral-400">پایان تقریبی نوبت را از ساعت شروع و این مدت حساب کنید.</div>
          </div>
        )}

        <Link
          href="/dashboard/voice-booking"
          className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 text-sm font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.01]"
        >
          <Mic className="h-4 w-4" />
          رفتن به رزرو صوتی هوشمند
        </Link>
      </PanelCard>
    </div>
  );
}
