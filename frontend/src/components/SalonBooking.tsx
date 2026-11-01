"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";

type Service = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  description?: string | null;
  category?: string | null;
  bufferMin?: number;
};
type Staff = { id: string; name: string; title?: string | null; services?: { id: string }[] };
type Extracted = { name?: string; phone?: string; service?: string; date?: string; time?: string; note?: string };
type Slot = { startAt: string; endAt: string };
type Branch = { id: string; name: string; city?: string | null; address?: string | null };
type FieldKey = "name" | "phone" | "service" | "date" | "time";

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "نام",
  phone: "شماره موبایل",
  service: "نام خدمت",
  date: "تاریخ",
  time: "ساعت",
};

const SAMPLE_SCRIPT =
  "سلام، می‌خوام نوبت رزرو کنم: برای فردا ساعت ده صبح، خدمت کوتاهی مو، به نام سارا احمدی، شماره موبایل ۰۹۱۲۳۴۵۶۷۸۹";

const REQUIRED_FIELDS: FieldKey[] = ["name", "phone", "date", "time"];

/** تبدیل ارقام فارسی به لاتین برای مقایسه ساعت */
function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/** ساعت محلی سالن یک اسلات به شکل HH:MM لاتین */
function localHHMM(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/** انتخاب اسلات آزادِ مطابق با ساعت استخراج‌شده از صدا */
function matchSlot(wanted: string | null | undefined, list: Slot[], timeZone: string): string | null {
  if (!wanted || list.length === 0) return null;
  const hit = list.find((s) => toLatinDigits(localHHMM(s.startAt, timeZone)) === wanted) ?? list[0];
  return hit.startAt;
}

/** تاریخ امروز در منطقه‌زمان سالن (نه منطقه‌زمان مرورگر) */
function todayISO(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

export default function SalonBooking({
  salonId,
  slug,
  timezone = "Asia/Tehran",
  maxAdvanceDays = 60,
  services,
  staff,
  branches = [],
}: {
  salonId: string;
  slug: string;
  timezone?: string;
  maxAdvanceDays?: number;
  services: Service[];
  staff: Staff[];
  branches?: Branch[];
}) {
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [slotISO, setSlotISO] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [recField, setRecField] = useState<FieldKey | "">("");
  const [fragments, setFragments] = useState<{ field: FieldKey; text: string }[]>([]);
  const [voiceCallId, setVoiceCallId] = useState("");
  const [sending, setSending] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const voiceTimeRef = useRef<string | null>(null);

  const today = todayISO(timezone);
  const maxDate = addDaysISO(today, Math.max(1, maxAdvanceDays));
  const serviceIdsKey = serviceIds.join(",");

  const selectedServices = useMemo(
    () => services.filter((s) => serviceIds.includes(s.id)),
    [services, serviceIds]
  );
  const totalDuration = selectedServices.reduce((sum, s) => sum + s.durationMin, 0);
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);

  // فقط آرایشگرانی که همه خدمات انتخاب‌شده را ارائه می‌دهند
  const compatibleStaff = useMemo(
    () =>
      staff.filter((st) => {
        const offered = st.services?.map((s) => s.id) ?? [];
        if (offered.length === 0) return true;
        return serviceIds.every((id) => offered.includes(id));
      }),
    [staff, serviceIds]
  );
  const compatibleIdsKey = compatibleStaff.map((s) => s.id).join(",");

  // اگر آرایشگر انتخاب‌شده دیگر خدمات انتخابی را ارائه ندهد، انتخاب پاک می‌شود
  const [prevCompatibleIdsKey, setPrevCompatibleIdsKey] = useState(compatibleIdsKey);
  if (compatibleIdsKey !== prevCompatibleIdsKey) {
    setPrevCompatibleIdsKey(compatibleIdsKey);
    if (employeeId && !compatibleIdsKey.split(",").includes(employeeId)) setEmployeeId("");
  }

  // بارگیری اسلات‌های آزاد وقتی خدمات + تاریخ انتخاب شد
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSlotISO("");
      if (!serviceIdsKey || !date) {
        setSlots([]);
        setLoadingSlots(false);
        return;
      }
      setLoadingSlots(true);
      try {
        const q = new URLSearchParams({ serviceIds: serviceIdsKey, date });
        if (employeeId) q.set("employeeId", employeeId);
        if (branchId) q.set("branchId", branchId);
        const res = await fetch(`/api/salons/${slug}/availability?${q}`);
        const data = await res.json();
        if (!cancelled) {
          const list: Slot[] = data.success ? data.slots : [];
          setSlots(list);
          // اگر صدا ساعتی استخراج کرده بود، اسلات آزاد همان ساعت انتخاب می‌شود
          const hit = matchSlot(voiceTimeRef.current, list, timezone);
          if (hit) {
            setSlotISO(hit);
            voiceTimeRef.current = null;
          }
          if (!data.success && data.error) setMsg({ ok: false, text: data.error });
        }
      } catch {
        if (!cancelled) {
          setSlots([]);
          setMsg({ ok: false, text: "خطا در دریافت زمان‌های آزاد. اتصال را بررسی کنید." });
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceIdsKey, date, employeeId, branchId, slug, timezone]);

  function toggleService(id: string) {
    setMsg(null);
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function startRecording(field: FieldKey | "") {
    setMsg(null);
    if (!field) setTranscript("");
    setRecField(field);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        if (field) void sendFieldAudio(field);
        else void sendAudio();
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      setRecField("");
      setMsg({ ok: false, text: "دسترسی به میکروفون ممکن نیست." });
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(SAMPLE_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  function applyExtracted(ex: Extracted) {
    setExtracted(ex);
    if (ex.name) setName(ex.name);
    if (ex.phone) setPhone(ex.phone);
    if (ex.date) setDate(ex.date);
    if (ex.time) voiceTimeRef.current = ex.time;
    if (ex.service) {
      const matched = services.find((s) => ex.service && (s.name.includes(ex.service) || ex.service.includes(s.name)));
      if (matched) setServiceIds([matched.id]);
    }
  }

  async function sendAudio() {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    form.append("salonId", salonId);
    form.append("phone", phone);

    setSending(true);
    try {
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "خطا در پردازش صدا");

      setTranscript(data.transcript);
      if (data.voiceCallId) setVoiceCallId(data.voiceCallId);
      const ex: Extracted = data.extracted ?? {};
      applyExtracted(ex);
      const missing = REQUIRED_FIELDS.filter((f) => !ex[f]);
      if (missing.length > 0) {
        setMsg({
          ok: false,
          text: `متن شما استخراج شد؛ ${missing.map((f) => FIELD_LABELS[f]).join("، ")} پیدا نشد. فقط همان موارد را بگویید یا در فرم تایپ کنید.`,
        });
      } else {
        setMsg({ ok: true, text: "همه اطلاعات استخراج شد. خدمت، تاریخ و ساعت را بررسی و تأیید کنید." });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا" });
    } finally {
      setSending(false);
    }
  }

  /** مشتری فقط همان فیلدِ نامفهوم را دوباره می‌گوید */
  async function sendFieldAudio(field: FieldKey) {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    const form = new FormData();
    form.append("audio", blob, "recording.webm");
    form.append("salonId", salonId);
    form.append("phone", phone);
    form.append("field", field);
    form.append("partial", JSON.stringify(extracted ?? {}));
    if (voiceCallId) form.append("voiceCallId", voiceCallId);

    setSending(true);
    try {
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "خطا در پردازش صدا");

      setFragments((prev) => [...prev, { field, text: data.transcript }]);
      if (data.voiceCallId) setVoiceCallId(data.voiceCallId);
      const ex: Extracted = data.extracted ?? {};
      applyExtracted(ex);
      // اگر ساعت تازه کامل شد و اسلات‌ها از قبل بارگیری شده‌اند، ساعت مطابق انتخاب می‌شود
      if (field === "time" && data.fieldValue) {
        const iso = matchSlot(data.fieldValue, slots, timezone);
        if (iso) {
          setSlotISO(iso);
          voiceTimeRef.current = null;
        }
      }
      if (data.fieldValue) {
        setMsg({ ok: true, text: `${FIELD_LABELS[field]} دریافت شد: ${data.fieldValue}` });
      } else {
        setMsg({ ok: false, text: `${FIELD_LABELS[field]} باز هم قابل تشخیص نبود؛ لطفاً آن را تایپ کنید.` });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا" });
    } finally {
      setRecField("");
      setSending(false);
    }
  }

  const submit = useCallback(async () => {
    if (serviceIds.length === 0) return setMsg({ ok: false, text: "حداقل یک خدمت انتخاب کنید." });
    if (!name.trim() || !phone.trim() || !date || !slotISO) {
      return setMsg({ ok: false, text: "نام، شماره موبایل، تاریخ و ساعت را کامل کنید." });
    }
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          serviceIds,
          employeeId: employeeId || undefined,
          branchId: branchId || undefined,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          startAt: slotISO,
          channel: "WEBAPP",
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "ثبت نوبت ناموفق بود");
      setMsg({ ok: true, text: "نوبت شما ثبت شد. پیامک تأیید و یادآوری برای شما ارسال می‌شود." });
      setName("");
      setPhone("");
      setDate("");
      setSlotISO("");
      setServiceIds([]);
      setEmployeeId("");
      setSlots([]);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا" });
    } finally {
      setSending(false);
    }
  }, [serviceIds, name, phone, date, slotISO, salonId, employeeId, branchId]);

  const input = "w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-pink-500";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-xl shadow-pink-500/5 sm:rounded-[2rem]">
      <div className="bg-gradient-to-l from-pink-600 to-purple-600 px-4 py-4 text-white sm:px-6">
        <h3 className="text-lg font-black">رزرو نوبت</h3>
        <p className="text-xs text-white/80">خدمت (چند مورد هم ممکن است)، تاریخ و ساعت واقعاً آزاد را انتخاب کنید</p>
      </div>

      <div className="p-4 sm:p-6">
        {/* Voice AI */}
        <div className="rounded-2xl bg-gradient-to-bl from-pink-50 to-purple-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-neutral-700">🎙️ نوبت‌دهی با صدا</p>
            <button
              onClick={() => setShowScript((v) => !v)}
              className="h-10 rounded-xl bg-white/80 px-3 text-[11px] font-bold text-purple-700 shadow-sm transition hover:bg-white active:scale-95"
            >
              {showScript ? "بستن متن نمونه" : "متن نمونه برای خواندن"}
            </button>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            میکروفون را بزنید و با صدای فارسی بگویید چه زمانی برای چه خدمتی نوبت می‌خواهید. اگر ربات بخشی را نفهمید، فقط همان بخش را دوباره می‌پرسد.
          </p>

          {showScript && (
            <div className="mt-3 rounded-xl border border-purple-200 bg-white/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-black text-purple-700">متن نمونه — مشخصات را با اطلاعات خودتان عوض کنید</span>
                <button
                  onClick={copyScript}
                  className="rounded-lg bg-purple-100 px-2 py-1 text-[10px] font-bold text-purple-700 hover:bg-purple-200"
                >
                  {copied ? "کپی شد ✓" : "کپی"}
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-neutral-700">«{SAMPLE_SCRIPT}»</p>
            </div>
          )}

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => (recording ? stopRecording() : startRecording(""))}
              disabled={sending || recField !== ""}
              className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-50 ${
                recording ? "bg-red-500 hover:bg-red-600" : "bg-pink-600 hover:bg-pink-700"
              }`}
              aria-label={recording ? "پایان ضبط" : "شروع ضبط صدا"}
            >
              {recording && <span className="absolute inset-0 rounded-full bg-red-400 animate-ping-slow" />}
              <span className="relative text-xl">{recording ? "⏹️" : "🎤"}</span>
            </button>
            <div className="text-xs text-neutral-500">
              {recording ? "در حال ضبط... برای پایان کلیک کنید" : sending ? "در حال پردازش هوش مصنوعی..." : "برای شروع کلیک کنید"}
            </div>
          </div>
          {transcript && (
            <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm leading-relaxed text-neutral-700">“{transcript}”</p>
          )}
          {fragments.map((fr, i) => (
            <p key={i} className="mt-2 rounded-xl border border-dashed border-purple-200 bg-white/60 p-2.5 text-xs text-neutral-500">
              <span className="font-bold text-neutral-700">{FIELD_LABELS[fr.field]}:</span> “{fr.text}”
            </p>
          ))}

          {extracted && (
            <div className="mt-3 rounded-xl border border-purple-200 bg-white/80 p-3">
              <div className="text-[11px] font-black text-purple-700">🤖 خروجی هوش مصنوعی</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                {(
                  [
                    ["name", extracted.name],
                    ["phone", extracted.phone],
                    ["service", extracted.service],
                    ["date", extracted.date],
                    ["time", extracted.time],
                  ] as [FieldKey, string | undefined][]
                )
                  .filter(([, v]) => Boolean(v))
                  .map(([k, v]) => (
                    <span key={k} className="rounded-full bg-purple-50 px-2.5 py-1 font-bold text-purple-700">
                      ✓ {FIELD_LABELS[k]}: {v}
                    </span>
                  ))}
              </div>
              {REQUIRED_FIELDS.filter((f) => !extracted[f]).map((f) => (
                <div key={f} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <span className="text-[11px] font-bold text-amber-700">ربات «{FIELD_LABELS[f]}» را متوجه نشد</span>
                  <button
                    onClick={() => (recField === f ? stopRecording() : startRecording(f))}
                    disabled={sending || (recField !== "" && recField !== f)}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black transition disabled:opacity-50 ${
                      recField === f ? "bg-red-500 text-white" : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                    }`}
                  >
                    {recField === f ? (
                      <>
                        <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> در حال ضبط... پایان
                      </>
                    ) : (
                      <>🎤 فقط {FIELD_LABELS[f]} را بگویید</>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="mt-5 space-y-4">
          {branches.length > 1 && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={input} aria-label="انتخاب شعبه">
              <option value="">انتخاب شعبه</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.city ? `— ${b.city}` : ""}
                </option>
              ))}
            </select>
          )}

          {/* انتخاب چند خدمت */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-600">۱. خدمات</span>
              {selectedServices.length > 0 && (
                <span className="text-[11px] text-neutral-500">
                  {selectedServices.length} خدمت — {totalDuration.toLocaleString("fa-IR")} دقیقه
                </span>
              )}
            </div>
            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-neutral-200 p-2">
              {services.length === 0 && <p className="p-2 text-xs text-neutral-400">خدمتی ثبت نشده است.</p>}
              {services.map((s) => {
                const checked = serviceIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      checked ? "bg-pink-50 text-pink-900 ring-1 ring-pink-200" : "hover:bg-neutral-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleService(s.id)}
                      className="h-5 w-5 shrink-0 accent-pink-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{s.name}</span>
                      <span className="block text-[11px] text-neutral-500">
                        {s.durationMin.toLocaleString("fa-IR")} دقیقه
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-xs font-bold text-pink-600">
                      {s.price.toLocaleString("fa-IR")} تومان
                    </span>
                  </label>
                );
              })}
            </div>
            {selectedServices.length > 1 && (
              <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                مجموع: <b>{totalPrice.toLocaleString("fa-IR")} تومان</b> — زمان تقریبی{" "}
                <b>{totalDuration.toLocaleString("fa-IR")} دقیقه</b>
              </p>
            )}
          </div>

          {/* آرایشگر */}
          {compatibleStaff.length > 0 && (
            <div>
              <span className="mb-2 block text-xs font-bold text-neutral-600">۲. آرایشگر (اختیاری)</span>
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={input} aria-label="انتخاب آرایشگر">
                <option value="">بدون ترجیح آرایشگر</option>
                {compatibleStaff.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} {st.title ? `(${st.title})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <span className="mb-2 block text-xs font-bold text-neutral-600">۳. مشخصات شما</span>
            <div className="space-y-2">
              <input
                placeholder="نام و نام خانوادگی"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input}
                autoComplete="name"
              />
              <input
                placeholder="شماره موبایل — ۰۹۱۲۳۴۵۶۷۸۹"
                dir="ltr"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`${input} text-center`}
                autoComplete="tel"
              />
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs font-bold text-neutral-600">۴. تاریخ و ساعت آزاد</span>
            <JalaliDatePicker
              value={date}
              onChange={setDate}
              min={today}
              max={maxDate}
              timeZone={timezone}
              placeholder="انتخاب تاریخ (شمسی)"
            />

            {loadingSlots && (
              <div className="mt-2 rounded-xl bg-neutral-50 py-4 text-center text-xs text-neutral-400">
                در حال بررسی زمان‌های واقعاً آزاد...
              </div>
            )}

            {!loadingSlots && date && serviceIds.length > 0 && slots.length > 0 && (
              <>
                <div className="mt-3 grid max-h-[45dvh] grid-cols-3 gap-2 overflow-y-auto sm:max-h-56 sm:grid-cols-4">
                  {slots.map((s) => {
                    const active = slotISO === s.startAt;
                    return (
                      <button
                        key={s.startAt}
                        type="button"
                        onClick={() => {
                          voiceTimeRef.current = null;
                          setSlotISO(s.startAt);
                        }}
                        className={`flex h-11 items-center justify-center rounded-xl border text-sm font-bold tabular-nums transition ${
                          active
                            ? "border-pink-600 bg-pink-600 text-white"
                            : "border-neutral-200 bg-white text-neutral-700 hover:border-pink-300 hover:bg-pink-50"
                        }`}
                      >
                        {formatTime(s.startAt, timezone)}
                      </button>
                    );
                  })}
                </div>
                {slotISO && (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                    زمان انتخابی: {formatTime(slotISO, timezone)} — پایان تقریبی{" "}
                    {formatTime(
                      new Date(new Date(slotISO).getTime() + totalDuration * 60000).toISOString(),
                      timezone
                    )}
                  </p>
                )}
              </>
            )}

            {!loadingSlots && date && serviceIds.length > 0 && slots.length === 0 && (
              <div className="mt-2 rounded-lg bg-amber-50 p-3">
                <p className="text-xs text-amber-700">
                  برای این خدمت در این روز زمانی آزاد نیست؛ تاریخ دیگری را امتحان کنید
                  {name && phone && " یا در لیست انتظار قرار بگیرید."}
                </p>
                {name && phone && (
                  <button
                    onClick={async () => {
                      const res = await fetch(`/api/salons/${slug}/waitlist`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          customerName: name,
                          customerPhone: phone,
                          serviceId: serviceIds[0],
                          employeeId: employeeId || undefined,
                        }),
                      });
                      const data = await res.json();
                      setMsg({
                        ok: data.success,
                        text: data.success
                          ? "در لیست انتظار ثبت شدید؛ در صورت آزادشدن زمان پیامک می‌گیرید ✅"
                          : data.error || "خطا",
                      });
                    }}
                    className="mt-2 h-10 rounded-lg bg-amber-600 px-4 text-xs font-bold text-white hover:bg-amber-700"
                  >
                    ثبت در لیست انتظار
                  </button>
                )}
              </div>
            )}

            {!date && <p className="mt-2 text-[11px] text-neutral-400">برای دیدن زمان‌های آزاد، تاریخ را انتخاب کنید.</p>}
          </div>

          <button
            onClick={submit}
            disabled={sending || serviceIds.length === 0 || !slotISO}
            className="h-12 w-full rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.02] hover:shadow-pink-500/40 disabled:opacity-50"
          >
            {sending ? "در حال ثبت..." : "ثبت نوبت ✨"}
          </button>

          {msg && (
            <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {msg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
