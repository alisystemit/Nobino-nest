"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/router-shim";
import {
  AlertCircle,
  CalendarCheck2,
  Check,
  CheckCircle2,
  FileUp,
  Keyboard,
  Loader2,
  Mic,
  Quote,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";
import TimeField from "@/components/ui/TimeField";
import { micBlockReason } from "@/lib/browser/capabilities";
import { mbToBytes, sizeHintFa, uploadLimitsSync } from "@/lib/upload-limits";
import { useMicCapability } from "@/lib/browser/use-mic-capability";
import { formatJalali, toPersianDigits } from "@/lib/time/jalali";
import { zonedTimeToIso } from "@/lib/time/zoned";

type Service = { id: string; name: string; durationMin: number; price: number };
type Staff = { id: string; name: string; isActive?: boolean; services?: { id: string }[] };
type Branch = { id: string; name: string };
type Extracted = { name?: string; phone?: string; service?: string; staff?: string; date?: string; time?: string; note?: string };
type FieldKey = "name" | "phone" | "service" | "staff" | "date" | "time";
/** منبع ورودی گفتار: ضبط زنده، فایل صوتی آماده، یا جملهٔ تایپ‌شده */
type SpeechSource = { audio?: Blob | File; text?: string };
type Stage = "idle" | "recording" | "working" | "needs" | "confirm" | "done";
type Booked = { name: string; date: string; time: string; service?: string; staff?: string; branch?: string };
type Candidate = { id: string; name: string; score: number };
/** تطبیق سمت سرور با کاتالوگ واقعی سالن؛ شناسهٔ خالی یعنی «مبهم، باید پرسیده شود» */
type Resolution = {
  serviceId?: string;
  staffId?: string;
  staffAny?: boolean;
  serviceCandidates?: Candidate[];
  staffCandidates?: Candidate[];
};
type ConfirmDraft = { name: string; phone: string; date: string; time: string; serviceId: string; staffId: string };

type TranscribeResponse = {
  success?: boolean;
  error?: string;
  transcript?: string;
  voiceCallId?: string;
  extracted?: Extracted;
} & Resolution;
type ServicesResponse = { success?: boolean; services?: Service[] };
type StaffResponse = { success?: boolean; staff?: Staff[] };
type BookResponse = { success?: boolean; error?: string };

const FIELD_LABELS: Record<FieldKey, string> = {
  name: "نام مشتری",
  phone: "شماره موبایل",
  service: "پکیج",
  staff: "آرایشگر",
  date: "تاریخ",
  time: "ساعت",
};

const SAMPLE_SCRIPT =
  "سلام، برای فردا ساعت ده صبح پکیج کوتاهی مو می‌خوام، با آرایشگر مریم رضایی، به نام سارا احمدی، شماره موبایل ۰۹۱۲۳۴۵۶۷۸۹";

/** پکیج اجباری است؛ آرایشگر اختیاری */
const REQUIRED_FIELDS: FieldKey[] = ["name", "phone", "service", "date", "time"];

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-800 outline-none transition focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

/**
 * صفحهٔ رزرو صوتیِ سبک برای گوشی.
 *
 * جریان: یک دکمهٔ بزرگِ ضبط → گفتار به متن → تشخیص نام/شماره/پکیج/آرایشگر/تاریخ/ساعت →
 * آلارتِ «همه چیز را گفتید، نوبت را ثبت کنم؟» → ثبت فقط با تأیید صریح کاربر.
 * فرم کاملِ نوبت حذف شده؛ فقط اگر ربات چیزی را نفهمید، همان موارد ناقص پرسیده می‌شود.
 * پکیج اجباری است و نام آرایشگر اختیاری؛ تطبیق هر دو با کاتالوگ واقعی سالن سمت سرور
 * انجام می‌شود (`serviceId`/`staffId`) و در ابهام، گزینه‌ها برای انتخاب برمی‌گردند.
 * شعبه هم انتخاب دستی ندارد: صفحه شعبهٔ خودِ کاربر را از سرور می‌گیرد و همان را ثبت می‌کند.
 *
 * روی http (بدون https) مرورگر میکروفون را قفل می‌کند؛ برای همین ارسال فایل صوتی و
 * نوشتن یک جمله هم در دسترس است و همان مسیر `/api/voice/transcribe` را طی می‌کنند.
 */
export default function AdminVoiceBooking({
  salonId,
  timezone,
  branches,
  autoBranchId,
}: {
  salonId: string;
  timezone?: string;
  branches: Branch[];
  autoBranchId?: string;
}) {
  const cap = useMicCapability();
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [resolution, setResolution] = useState<Resolution>({});
  const [confirmDraft, setConfirmDraft] = useState<ConfirmDraft | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [transcript, setTranscript] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [missingFields, setMissingFields] = useState<FieldKey[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [voiceCallId, setVoiceCallId] = useState("");
  const [showText, setShowText] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      const [svc, people] = await Promise.all([
        fetch(`/api/dashboard/salons/${salonId}/services`).then((r) => r.json()) as Promise<ServicesResponse>,
        fetch(`/api/dashboard/salons/${salonId}/staff`).then((r) => r.json()) as Promise<StaffResponse>,
      ]);
      if (svc.success && svc.services) setServices(svc.services);
      if (people.success && people.staff) setStaff(people.staff.filter((s) => s.isActive !== false));
    })();
  }, [salonId]);

  // شمارندهٔ ثانیه‌های ضبط — فقط برای نشان‌دادن اینکه صفحه زنده است
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const micReason = cap ? micBlockReason(cap) : null;
  const micReady = cap !== null && micReason === null;
  const processing = stage === "working";
  const bookedBranch = branches.find((b) => b.id === autoBranchId)?.name;
  /** فقط آرایشگرانی که این پکیج را انجام می‌دهند (بدون پکیج: همه) */
  const shownStaff = serviceId
    ? staff.filter((s) => !s.services?.length || s.services.some((x) => x.id === serviceId))
    : staff;
  const staffValid = staffId === "" || shownStaff.some((s) => s.id === staffId);

  function startRecording() {
    setMsg(null);
    if (!micReady) {
      setShowText(true);
      setMsg({
        ok: false,
        text: `${micReason ?? "میکروفون در دسترس نیست."} فایل صوتی بفرستید یا جمله را بنویسید.`,
      });
      return;
    }
    setConfirmDraft(null);
    setSeconds(0);
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mr = new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        mr.onstop = () => {
          const audio = new Blob(chunksRef.current, { type: "audio/webm" });
          void transcribe({ audio });
        };
        mr.start();
        recRef.current = mr;
        setStage("recording");
        setRecording(true);
      })
      .catch(() => {
        setShowText(true);
        setMsg({
          ok: false,
          text: "دسترسی به میکروفون ممکن نیست. یا اجازهٔ ضبط را نداده‌اید، یا این آدرس امن (https) نیست.",
        });
      });
  }

  function stopRecording() {
    recRef.current?.stop();
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setStage("working");
  }

  /** آپلود فایل صوتی آماده — جایگزین ضبط وقتی میکروفون قفل یا محدود است */
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(null);
    void transcribe({ audio: file });
  }

  function buildBody(source: SpeechSource) {
    const form = new FormData();
    if (source.audio) {
      if (source.audio instanceof File) form.append("audio", source.audio);
      else form.append("audio", source.audio, "rec.webm");
    }
    if (source.text) form.append("text", source.text);
    form.append("salonId", salonId);
    form.append("phone", phone);
    if (extracted) form.append("partial", JSON.stringify(extracted));
    if (voiceCallId) form.append("voiceCallId", voiceCallId);
    return form;
  }

  async function transcribe(source: SpeechSource) {
    // پیش‌بررسی حجم با سقف پویای سوپرادمین (بررسی قطعی سمت سرور است)
    if (source.audio && source.audio.size > mbToBytes(uploadLimitsSync().voiceMaxMb)) {
      setMsg({ ok: false, text: `حجم فایل صوتی ${sizeHintFa(uploadLimitsSync().voiceMaxMb)} است.` });
      return;
    }
    setShowText(false);
    setTypedText("");
    setMsg(null);
    setConfirmDraft(null);
    setStage("working");
    try {
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: buildBody(source) });
      const data = (await res.json()) as TranscribeResponse;
      if (!data.success) throw new Error(data.error || "خطا در تبدیل گفتار");
      setTranscript(data.transcript ?? "");
      if (data.voiceCallId) setVoiceCallId(data.voiceCallId);
      const ex: Extracted = data.extracted ?? {};
      const resolved: Resolution = {
        serviceId: data.serviceId ?? "",
        staffId: data.staffId ?? "",
        staffAny: Boolean(data.staffAny),
        serviceCandidates: data.serviceCandidates ?? [],
        staffCandidates: data.staffCandidates ?? [],
      };
      setResolution(resolved);
      const matched = applyExtracted(ex, resolved);
      // پکیج وقتی «گفته شده» حساب می‌شود که به یک شناسهٔ واقعیِ همین سالن رسیده باشد
      const missing = REQUIRED_FIELDS.filter((f) => (f === "service" ? !matched.serviceId : !ex[f]));
      setMissingFields(missing);
      if (missing.length > 0) {
        setStage("needs");
        setMsg({
          ok: false,
          text: missing.includes("service")
            ? (resolved.serviceCandidates?.length ?? 0) > 1
              ? `«${ex.service ?? ""}» به چند پکیج می‌خورد — کدام را می‌خواهید؟`
              : `«${ex.service || "پکیج"}» در فهرست این سالن پیدا نشد — بگویید چه چیزی رزرو شود یا انتخاب کنید.`
            : `«${missing.map((f) => FIELD_LABELS[f]).join("، ")}» را متوجه نشدم — یک‌بار همان را بگویید یا بنویسید.`,
        });
      } else {
        askConfirmation({
          name: ex.name!,
          phone: ex.phone!,
          date: ex.date!,
          time: ex.time!,
          serviceId: matched.serviceId,
          staffId: matched.staffId,
        });
      }
    } catch (e) {
      setStage("needs");
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا" });
    }
  }

  /** شناسه‌ها را سرور از کاتالوگ واقعی سالن گرفته است؛ خالی یعنی «پیدا نشد یا مبهم بود» */
  function applyExtracted(ex: Extracted, resolved: Resolution): { serviceId: string; staffId: string } {
    setExtracted(ex);
    if (ex.name) setName(ex.name);
    if (ex.phone) setPhone(ex.phone);
    if (ex.date) setDate(ex.date);
    if (ex.time) setTime(ex.time);
    const matchedService = resolved.serviceId && services.some((s) => s.id === resolved.serviceId) ? resolved.serviceId : "";
    if (matchedService) setServiceId(matchedService);
    const eligible = matchedService
      ? staff.filter((s) => !s.services?.length || s.services.some((x) => x.id === matchedService))
      : staff;
    const matchedStaff =
      resolved.staffAny || !resolved.staffId ? "" : eligible.some((s) => s.id === resolved.staffId) ? resolved.staffId : "";
    setStaffId(matchedStaff);
    return { serviceId: matchedService, staffId: matchedStaff };
  }

  async function submitAppointment(payload: ConfirmDraft): Promise<boolean> {
    if (!payload.serviceId) {
      setStage("needs");
      setMsg({ ok: false, text: "پکیج مورد نظر مشخص نیست؛ اول انتخاب کنید چه چیزی رزرو شود." });
      return false;
    }
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salonId,
          serviceId: payload.serviceId,
          employeeId: payload.staffId || undefined,
          // شعبهٔ خودِ کاربر از سرور آمده است؛ هیچ انتخاب دستی و پیش‌فرض خالی وجود ندارد
          branchId: autoBranchId || undefined,
          customerName: payload.name,
          customerPhone: payload.phone,
          // ساعت سالن (نه ساعت مرورگر) — وگرنه کاربر با TZ متفاوت، نوبت چند ساعت جابه‌جا می‌شود
          startAt: zonedTimeToIso(payload.date, payload.time, timezone),
          channel: "VOICE",
          voiceCallId: voiceCallId || undefined,
        }),
      });
      const data = (await res.json()) as BookResponse;
      if (!data.success) throw new Error(data.error || "خطا در ثبت نوبت");
      setBooked({
        name: payload.name,
        date: payload.date,
        time: payload.time,
        service: services.find((s) => s.id === payload.serviceId)?.name ?? extracted?.service,
        staff: staff.find((s) => s.id === payload.staffId)?.name,
        branch: bookedBranch,
      });
      setConfirmDraft(null);
      setMsg(null);
      setStage("done");
      return true;
    } catch (e) {
      setStage("needs");
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا" });
      return false;
    }
  }

  /** همهٔ موارد گفته شده → آلارت تأیید؛ نوبت تا تأیید صریح کاربر ثبت نمی‌شود */
  function askConfirmation(draft: ConfirmDraft) {
    setConfirmDraft(draft);
    setMsg(null);
    setStage("confirm");
  }

  async function confirmBooking() {
    if (!confirmDraft) return;
    setStage("working");
    await submitAppointment(confirmDraft);
  }

  function submitTypedSentence() {
    const text = typedText.trim();
    if (text.length < 3) {
      setMsg({ ok: false, text: "کمی کامل‌تر بنویسید؛ مثلاً «فردا ۱۰ صبح کوتاهی مو با مریم رضایی، سارا احمدی، ۰۹۱۲۳۴۵۶۷۸۹»." });
      return;
    }
    void transcribe({ text });
  }

  function submitForm() {
    if (!name || !phone || !date || !time || !serviceId) {
      setMsg({ ok: false, text: "نام، شماره، پکیج، تاریخ و ساعت را کامل کنید." });
      return;
    }
    askConfirmation({ name, phone, date, time, serviceId, staffId: staffValid ? staffId : "" });
  }

  /** اصلاح یک فیلد؛ extracted هم به‌روز می‌شود تا در گفتار بعدی از دست نرود */
  function fillField(field: FieldKey, value: string) {
    const next = { ...(extracted ?? {}) } as Extracted;
    if (value) next[field] = value;
    else delete next[field];
    setExtracted(next);
    if (field === "name") setName(value);
    if (field === "phone") setPhone(value);
    if (field === "date") setDate(value);
    if (field === "time") setTime(value);
    if (field === "service") pickService(value);
    if (field === "staff") pickStaff(value);
    if (value) setMissingFields((prev) => prev.filter((f) => f !== field));
  }

  /** انتخاب پکیج از فهرست (یا از گزینه‌های مبهم) — نامش در extracted هم می‌نشیند */
  function pickService(id: string) {
    setServiceId(id);
    setStaffId("");
    setExtracted((prev) => ({ ...(prev ?? {}), service: services.find((s) => s.id === id)?.name ?? prev?.service }));
    setResolution((prev) => ({ ...prev, serviceId: id, serviceCandidates: [], staffId: "", staffCandidates: [] }));
    setMissingFields((prev) => prev.filter((f) => f !== "service" && f !== "staff"));
  }

  /** انتخاب آرایشگر — اختیاری؛ مقدار خالی یعنی «فرقی نمی‌کند» */
  function pickStaff(id: string) {
    setStaffId(id);
    setExtracted((prev) => {
      const next = { ...(prev ?? {}) };
      const hit = staff.find((s) => s.id === id);
      if (hit) next.staff = hit.name;
      else delete next.staff;
      return next;
    });
    setResolution((prev) => ({ ...prev, staffId: id, staffAny: !id, staffCandidates: [] }));
  }

  function reset() {
    setTranscript("");
    setExtracted(null);
    setMissingFields([]);
    setName("");
    setPhone("");
    setDate("");
    setTime("");
    setServiceId("");
    setStaffId("");
    setResolution({});
    setConfirmDraft(null);
    setVoiceCallId("");
    setMsg(null);
    setBooked(null);
    setStage("idle");
    setShowText(false);
    setTypedText("");
    setSeconds(0);
  }

  const hasTranscript = Boolean(transcript);
  const hasExtracted = Boolean(extracted);
  const showFallback = showText || (cap !== null && !micReady);
  const steps: { title: string; desc: string; state: "idle" | "active" | "done" }[] = [
    {
      title: "شنیدن صدای شما",
      desc: stage === "recording" ? `در حال ضبط… ${mmss(seconds)}` : hasTranscript ? "صدا گرفته شد" : "با یک لمس شروع می‌شود",
      state: stage === "recording" ? "active" : hasTranscript ? "done" : "idle",
    },
    {
      title: "تبدیل گفتار به متن",
      desc: hasTranscript ? "گفتار فارسی به متن تبدیل شد" : processing && !hasTranscript ? "در حال تبدیل…" : "خودکار",
      state: hasTranscript ? "done" : processing && !hasTranscript ? "active" : "idle",
    },
    {
      title: "تشخیص نام، شماره، پکیج و زمان",
      desc: hasExtracted
        ? missingFields.length > 0
          ? `ناقص: ${missingFields.map((f) => FIELD_LABELS[f]).join("، ")}`
          : "همهٔ اطلاعات پیدا شد"
        : hasTranscript
          ? "در حال تشخیص…"
          : "پکیج اجباری، آرایشگر اختیاری",
      state: hasExtracted ? "done" : hasTranscript && processing ? "active" : "idle",
    },
    {
      title: "تأیید شما و ثبت نوبت",
      desc: booked
        ? "نوبت در دیتابیس ثبت شد"
        : stage === "confirm"
          ? "همه چیز گفته شد — منتظر تأیید شما"
          : stage === "working" && hasExtracted
            ? "در حال ثبت…"
            : "بدون تأیید شما نوبتی ثبت نمی‌شود",
      state: booked ? "done" : stage === "confirm" || (stage === "working" && hasExtracted) ? "active" : "idle",
    },
  ];

  const showAll = stage === "needs" && missingFields.length === 0;

  return (
    <div className="flex flex-1 flex-col px-5 pb-8">
      {!booked ? (
        <>
          {/* دکمهٔ اصلی: فقط یک لمس */}
          <div className="flex flex-col items-center pt-4">
            <button
              type="button"
              onClick={() => (recording ? stopRecording() : startRecording())}
              disabled={processing}
              aria-label={recording ? "پایان ضبط" : "شروع ضبط صدا"}
              className={`relative flex h-40 w-40 items-center justify-center rounded-full text-white shadow-2xl transition active:scale-95 disabled:opacity-60 ${
                recording
                  ? "bg-red-500 shadow-red-500/30"
                  : "bg-gradient-to-br from-pink-600 via-fuchsia-600 to-purple-600 shadow-pink-500/30"
              }`}
            >
              {recording && <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />}
              {recording ? (
                <Square className="relative h-12 w-12 fill-white" />
              ) : processing ? (
                <Loader2 className="relative h-14 w-14 animate-spin" />
              ) : (
                <Mic className="relative h-16 w-16" />
              )}
            </button>
            <p role="status" aria-live="polite" className="mt-4 text-center text-sm font-black text-neutral-800 dark:text-neutral-100">
              {stage === "recording"
                ? `در حال شنیدن… ${mmss(seconds)}`
                : processing
                  ? "در حال پردازش…"
                  : stage === "confirm"
                    ? "همه چیز را گفتید — نوبت را ثبت کنم؟"
                    : stage === "needs"
                      ? "یک‌بار دیگر بگویید یا موارد مانده را تکمیل کنید"
                      : "لمس کنید و از روی متن بخوانید"}
            </p>
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
              یک جمله کافی است؛ پکیج را حتماً بگویید، نام آرایشگر اختیاری است
            </p>
          </div>

          {/* متن نمونه */}
          <div className="mt-5 rounded-2xl border border-pink-100 bg-pink-50/70 p-3.5 dark:border-pink-900/40 dark:bg-pink-950/20">
            <p className="flex items-center gap-1.5 text-[10px] font-black text-pink-600 dark:text-pink-300">
              <Quote className="h-3.5 w-3.5" /> متن نمونه
            </p>
            <p className="mt-1.5 text-[13px] leading-6 text-neutral-700 dark:text-neutral-200">«{SAMPLE_SCRIPT}»</p>
            <p className="mt-1 text-[10px] text-pink-500/80 dark:text-pink-400/70">نام، شماره، پکیج و زمان را با اطلاعات واقعی مشتری بگویید. اگر نام آرایشگر گفته نشود، سالن خودش تعیین می‌کند.</p>
          </div>

          {/* راه‌های جایگزین — روی http میکروفون قفل است */}
          {micReason && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>میکروفون این آدرس قفل است (http). از فایل صوتی یا نوشتن جمله استفاده کنید.</span>
            </div>
          )}
          <div className="mt-3 flex items-center justify-center gap-2">
            {showFallback ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowText(false);
                    fileRef.current?.click();
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-700 transition active:scale-95 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <FileUp className="h-4 w-4" /> فایل صوتی
                </button>
                <button
                  type="button"
                  onClick={() => setShowText((v) => !v)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-4 text-xs font-black text-neutral-700 transition active:scale-95 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  <Keyboard className="h-4 w-4" /> نوشتن جمله
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowText((v) => !v)}
                className="text-[11px] font-bold text-neutral-400 transition hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                میکروفون ندارید؟ جمله را بنویسید
              </button>
            )}
            <input ref={fileRef} type="file" accept="audio/*,.ogg,.webm,.mp3,.wav,.m4a,.aac" className="hidden" onChange={onPickFile} />
          </div>

          {showText && (
            <div className="mt-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-3 dark:border-purple-900/40 dark:bg-purple-950/20">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-black text-purple-700 dark:text-purple-300">
                  {missingFields.length > 0
                    ? `فقط این‌ها را بنویسید: ${missingFields.map((f) => FIELD_LABELS[f]).join("، ")}`
                    : "جملهٔ رزرو را بنویسید"}
                </p>
                <button type="button" onClick={() => setShowText(false)} aria-label="بستن" className="text-neutral-400">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <textarea
                className={`${inputCls} mt-2 h-20 resize-none text-[13px] leading-6`}
                placeholder="فردا ۱۰ صبح کوتاهی مو با مریم رضایی، سارا احمدی، ۰۹۱۲۳۴۵۶۷۸۹"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
              />
              <button
                type="button"
                onClick={submitTypedSentence}
                disabled={processing}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 text-xs font-black text-white transition active:scale-[0.99] disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> تبدیل و بررسی
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="pt-4">
          <div className="rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-xl shadow-emerald-500/20">
            <CheckCircle2 className="h-9 w-9" />
            <p className="mt-2 text-lg font-black">نوبت ثبت شد</p>
            <p className="mt-1 text-xs text-white/85">
              {booked.name}
              {booked.service ? ` — ${booked.service}` : ""}
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-sm font-black">
              <CalendarCheck2 className="h-4 w-4" />
              {formatJalali(booked.date)} — ساعت {toPersianDigits(booked.time)}
            </p>
            {booked.branch && <p className="mt-1.5 text-[10px] text-white/80">شعبه: {booked.branch}</p>}
            {booked.staff && <p className="mt-1 text-[10px] text-white/80">آرایشگر: {booked.staff}</p>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link
              href="/dashboard/appointments"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-[#1c2434] text-xs font-black text-white transition active:scale-[0.98] dark:bg-white dark:text-neutral-900"
            >
              دیدن نوبت‌ها
            </Link>
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-black text-neutral-700 transition active:scale-[0.98] dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <Mic className="h-4 w-4" /> نوبت جدید
            </button>
          </div>
        </div>
      )}

      {/* پردازش‌ها تا ثبت نوبت */}
      <ol className="mt-6 space-y-2.5">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                s.state === "done"
                  ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : s.state === "active"
                    ? "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300"
                    : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
              }`}
            >
              {s.state === "done" ? <Check className="h-4 w-4" /> : s.state === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : toPersianDigits(i + 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-black ${s.state === "idle" ? "text-neutral-400 dark:text-neutral-500" : "text-neutral-800 dark:text-neutral-100"}`}>
                {s.title}
              </p>
              <p className="mt-0.5 text-[10px] leading-5 text-neutral-400 dark:text-neutral-500">{s.desc}</p>
              {i === 1 && hasTranscript && (
                <p className="mt-1 line-clamp-2 rounded-lg bg-neutral-50 px-2 py-1 text-[10px] leading-5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  «{transcript}»
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {/* اطلاعات استخراج‌شده */}
      {extracted && hasExtracted && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["name", "phone", "service", "staff", "date", "time"] as FieldKey[])
            .filter((k) => Boolean(extracted[k]))
            .map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-neutral-600 shadow-sm ring-1 ring-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700"
              >
                <Check className="h-3 w-3 text-emerald-500" />
                {FIELD_LABELS[k]}:{" "}
                {k === "service"
                  ? (services.find((s) => s.id === serviceId)?.name ?? String(extracted[k]))
                  : k === "staff"
                    ? (staff.find((s) => s.id === staffId)?.name ?? String(extracted[k]))
                    : k === "date"
                      ? formatJalali(String(extracted[k])) || String(extracted[k])
                      : k === "time" || k === "phone"
                        ? toPersianDigits(String(extracted[k]))
                        : String(extracted[k])}
              </span>
            ))}
        </div>
      )}

      {msg && !booked && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-[11px] leading-5 ${
            msg.ok
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* آلارت تأیید — همهٔ موارد گفته شده؛ ثبت فقط با تأیید صریح کاربر */}
      {stage === "confirm" && confirmDraft && !booked && (
        <section
          role="alertdialog"
          aria-labelledby="avb-confirm-title"
          className="mt-3 rounded-2xl border-2 border-amber-400/70 bg-amber-50 p-4 dark:border-amber-500/50 dark:bg-amber-950/30"
        >
          <p id="avb-confirm-title" className="flex items-center gap-2 text-sm font-black text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-5 w-5 shrink-0" />
            همه چیز را گفتید — نوبت را ثبت کنم؟
          </p>
          <p className="mt-1.5 text-[10px] leading-5 text-amber-700/80 dark:text-amber-300/70">
            این اطلاعات از گفتار گرفته شد. با تأیید شما ثبت می‌شود و پیامک تأیید می‌رود.
          </p>
          <dl className="mt-3 space-y-1.5 rounded-xl bg-white/70 p-3 text-[11px] dark:bg-neutral-900/40">
            {[
              ["پکیج", services.find((s) => s.id === confirmDraft.serviceId)?.name ?? "—"],
              ["آرایشگر", confirmDraft.staffId ? (staff.find((s) => s.id === confirmDraft.staffId)?.name ?? "—") : "فرقی نمی‌کند (انتخاب سالن)"],
              ["نام مشتری", confirmDraft.name],
              ["شماره", toPersianDigits(confirmDraft.phone)],
              ["تاریخ", formatJalali(confirmDraft.date) || confirmDraft.date],
              ["ساعت", toPersianDigits(confirmDraft.time)],
              ...(bookedBranch ? [["شعبه", bookedBranch]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3">
                <dt className="shrink-0 font-bold text-neutral-400 dark:text-neutral-500">{label}</dt>
                <dd className="min-w-0 text-left font-black text-neutral-800 dark:text-neutral-100">{value}</dd>
              </div>
            ))}
          </dl>
          {transcript && (
            <p className="mt-2 rounded-lg bg-white/60 px-2.5 py-2 text-[10px] leading-5 text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
              «{transcript}»
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void confirmBooking()}
              disabled={processing}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 text-xs font-black text-white shadow-lg shadow-emerald-500/20 transition active:scale-[0.99] disabled:opacity-50"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} بله، ثبت کن
            </button>
            <button
              type="button"
              disabled={processing}
              onClick={() => {
                setConfirmDraft(null);
                setStage("needs");
                setMissingFields([]);
                setMsg({ ok: false, text: "هر مورد را که می‌خواهید عوض کنید، بعد دوباره «ثبت نوبت» را بزنید." });
              }}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 transition active:scale-[0.99] disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <X className="h-4 w-4" /> نه، اصلاح می‌کنم
            </button>
          </div>
        </section>
      )}

      {/* فقط موارد ناقص — فرم کامل وجود ندارد */}
      {stage === "needs" && !booked && (
        <section className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-700 dark:bg-neutral-800/40">
          <p className="text-xs font-black text-neutral-800 dark:text-neutral-100">تکمیل نوبت</p>
          <p className="mt-1 text-[10px] leading-5 text-neutral-400 dark:text-neutral-500">
            بقیهٔ اطلاعات از گفتار شما گرفته شد؛ فقط همین چند مورد مانده است.
          </p>
          <div className="mt-3 space-y-2">
            {(missingFields.includes("name") || showAll) && (
              <input
                className={inputCls}
                placeholder="نام مشتری"
                value={name}
                onChange={(e) => fillField("name", e.target.value)}
              />
            )}
            {(missingFields.includes("phone") || showAll) && (
              <input
                className={`${inputCls} text-center`}
                dir="ltr"
                inputMode="tel"
                placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                value={phone}
                onChange={(e) => fillField("phone", e.target.value)}
              />
            )}
            {(missingFields.includes("date") || showAll) && (
              <JalaliDatePicker value={date} onChange={(v) => fillField("date", v)} timeZone={timezone} placeholder="تاریخ (شمسی)" />
            )}
            {(missingFields.includes("time") || showAll) && (
              <TimeField value={time} onChange={(v) => fillField("time", v)} />
            )}
          </div>
          {(resolution.serviceCandidates?.length ?? 0) > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black text-neutral-500 dark:text-neutral-400">کدام پکیج؟</span>
              {resolution.serviceCandidates!.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickService(c.id)}
                  className={`rounded-full px-3 py-1.5 text-[10px] font-black transition active:scale-95 ${
                    serviceId === c.id
                      ? "bg-pink-600 text-white"
                      : "bg-white text-neutral-700 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {services.length > 0 && (
            <select className={`${inputCls} mt-2`} value={serviceId} onChange={(e) => pickService(e.target.value)} aria-label="پکیج (لازم)">
              <option value="">پکیج (لازم) — انتخاب کنید</option>
              {services.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          )}
          {shownStaff.length > 0 && (
            <>
              {(resolution.staffCandidates?.length ?? 0) > 1 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-black text-neutral-500 dark:text-neutral-400">کدام آرایشگر؟</span>
                  {resolution.staffCandidates!.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickStaff(c.id)}
                      className={`rounded-full px-3 py-1.5 text-[10px] font-black transition active:scale-95 ${
                        staffId === c.id
                          ? "bg-pink-600 text-white"
                          : "bg-white text-neutral-700 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-700"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <select className={`${inputCls} mt-2`} value={staffValid ? staffId : ""} onChange={(e) => pickStaff(e.target.value)} aria-label="آرایشگر (اختیاری)">
                <option value="">آرایشگر (اختیاری) — فرقی نمی‌کند</option>
                {shownStaff.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={submitForm}
              disabled={processing || !serviceId}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 text-xs font-black text-white shadow-lg shadow-pink-500/20 transition active:scale-[0.99] disabled:opacity-50"
            >
              <CalendarCheck2 className="h-4 w-4" /> بررسی و ثبت نوبت
            </button>
            <button
              type="button"
              onClick={startRecording}
              disabled={processing || recording}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 text-xs font-black text-neutral-700 transition active:scale-[0.99] disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <Mic className="h-4 w-4" /> بگویید
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/** ثانیه‌ها به شکل «۰۰:۱۲» با ارقام فارسی */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return toPersianDigits(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
}
