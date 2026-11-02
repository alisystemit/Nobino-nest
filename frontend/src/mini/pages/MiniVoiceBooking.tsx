/**
 * «رزرو با هوش مصنوعی و دستی» — تب پنجم نوار پایین مینی‌اپ.
 *
 * دو راه در یک صفحه:
 *  ۱) هوش مصنوعی (صوتی): ویس کاربر → `/api/voice/transcribe` (همان سرویس «رزرو صوتی»
 *     پنل: تبدیل گفتار فارسی به متن و سپس استخراج نام / شماره / خدمت / تاریخ / ساعت)
 *     → اگر همه‌چیز پیدا شد نوبت خودکار ثبت می‌شود و هر چه کم باشد فقط همان مورد
 *     پرسیده می‌شود (فرم کامل وجود ندارد).
 *  ۲) دستی: خدمت، آرایشگر، روز، ساعت و نام/شماره — با همان ساعت‌های واقعیِ سالن.
 *
 * روت تازه‌ای لازم ندارد: صدا و استخراج از `/api/voice/transcribe`، ساعت‌های خالی از
 * `/api/salons/:slug/availability` و ثبت نوبت از همان `POST /api/appointments` سایت
 * (با `channel=VOICE` و `voiceCallId` مثل پنل) — پس `gen-controllers.mjs` اجرا نمی‌شود.
 *
 * نکتهٔ مهم: ساعتِ گفته‌شده با «وقت‌های واقعاً آزاد» تطبیق داده می‌شود؛ اگر دقیقاً همان
 * ساعت پر باشد نزدیک‌ترین وقت‌ها پیشنهاد می‌شوند تا نوبتی داخل ساعت بستهٔ سالن ثبت نشود.
 * روی بستر ناامن (http) مرورگر میکروفون را قفل می‌کند، پس ارسال فایل صوتی و نوشتن
 * جمله هم همین‌جا هست و هر سه از یک مسیر سرور عبور می‌کنند.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DayStrip, ServicePicker, SlotGrid, StaffPicker, eligibleStaff, upcomingDays } from "../components/booking";
import { Area, Button, EmptyState, Field, Icon, Row, SectionTitle, SkeletonList, Tabs } from "../components/ui";
import { haptic } from "../lib/bridge";
import { dayLabel, faDigits, fullLabel, isPhone, normalizePhone, relativeDayLabel, timeLabel, toman } from "../lib/format";
import { useFavorites } from "../lib/favorites";
import { SOURCE_LABEL, resolveHomeSalon, type HomeSalon } from "../lib/resolve";
import { mapi, useMini } from "../lib/store";
import { getUploadLimits, mbToBytes, sizeHintFa, uploadLimitsSync } from "@/lib/upload-limits";
import type { AvailabilityResponse, MiniSalonDetail, MiniStaff } from "../lib/types";

type Extracted = { name?: string; phone?: string; service?: string; date?: string; time?: string };
type FieldKey = "name" | "phone" | "service" | "date" | "time";
type Mode = "ai" | "manual";
type Stage = "idle" | "recording" | "working" | "needs" | "done";

/**
 * سقف ضبط — از حجم مجاز ویسِ سوپرادمین مشتق می‌شود.
 * مبنای تخمین، همان ۸KB/s سرور برای مدت ضبط webm است (۶۰ ثانیه ≈ ۰/۵ مگابایت)؛
 * کف آن ۶۰ ثانیه می‌ماند تا رفتار پیشین با پایین آمدن سقف تغییر ناگهانی نکند.
 */
const RECORD_MIN_SECONDS = 60;
const BYTES_PER_SECOND = 8000;
const DAYS_SHOWN = 14;
/** فیلدهایی که بدون آن‌ها نوبتی ثبت نمی‌شود (خدمت اختیاری است، مثل پنل) */
const REQUIRED_FIELDS: FieldKey[] = ["name", "phone", "date", "time"];
const FIELD_LABELS: Record<FieldKey, string> = {
  name: "نام",
  phone: "شماره موبایل",
  service: "خدمت",
  date: "تاریخ",
  time: "ساعت",
};
const SAMPLE_SCRIPT = "سلام، برای فردا ساعت ده صبح نوبت کوتاهی مو می‌خوام، به نام سارا احمدی، شماره موبایل ۰۹۱۲۳۴۵۶۷۸۹";

/** رقم فارسی/عربی → لاتین، فقط برای مقایسهٔ ساعت */
function latinDigits(value: string): string {
  return String(value ?? "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** «۱۰:۳۰» / «۱۰:۳۰ ص» / «10.30» → `HH:MM` بیست‌وچهارساعته (خالی اگر ناخوانا بود) */
function normalizeClock(value: string): string {
  const raw = latinDigits(value).replace(/[^\d:]/g, ":");
  const m = /(\d{1,2}):(\d{1,2})/.exec(raw);
  if (!m) return "";
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** ساعت یک ISO در منطقهٔ زمانی سالن، به شکل لاتین `HH:MM` */
function clockInSalonTz(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: timezone }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/** تطبیق نام خدمتِ گفته‌شده با خدمات واقعی سالن (دوطرفه، بی‌توجه به فاصله‌های اضافه) */
function matchServiceId(salon: MiniSalonDetail | null, spoken: string): string {
  if (!salon || !spoken.trim()) return "";
  const said = spoken.trim().replace(/\s+/g, " ");
  const hit = salon.services.find((s) => {
    const name = s.name.trim().replace(/\s+/g, " ");
    return name === said || name.includes(said) || said.includes(name);
  });
  return hit?.id ?? "";
}

export default function MiniVoiceBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, configReady, authReady, me, profile, saveProfile, toast } = useMini();
  const favorites = useFavorites(me?.id ?? null);
  const favKey = favorites.slugs.join(",");

  const [home, setHome] = useState<HomeSalon | null>(null);
  const [salon, setSalon] = useState<MiniSalonDetail | null>(null);
  const [staff, setStaff] = useState<MiniStaff[]>([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode>("ai");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState("");
  const [day, setDay] = useState("");
  const [startAt, setStartAt] = useState("");
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // نام/شماره فقط برای مشتری از حسابش پیش‌پر می‌شود (سالن‌دار برای مشتری دیگری رزرو می‌کند)
  const isCustomer = me?.role === "CUSTOMER";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");

  const [stage, setStage] = useState<Stage>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [missing, setMissing] = useState<FieldKey[]>([]);
  const [voiceCallId, setVoiceCallId] = useState("");
  const [typed, setTyped] = useState("");
  const [showText, setShowText] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  /** توضیح «ساعت گفته‌شده پر بود» که در کارت موفقیت هم نمایش داده می‌شود */
  const [adjusted, setAdjusted] = useState("");
  /** وقتی فقط یک مورد کم است، کاربر همان را جدا می‌گوید (حالت `field` سرویس رزرو صوتی) */
  const [pendingField, setPendingField] = useState<FieldKey | null>(null);
  const [booked, setBooked] = useState<{ id: string; startAt: string; name?: string; phone?: string; service?: string } | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const autoBookedRef = useRef(false);
  const startAtRef = useRef("");
  const stopRecordingRef = useRef<(() => void) | null>(null);

  const timezone = salon?.timezone || "Asia/Tehran";
  const days = useMemo(() => upcomingDays(DAYS_SHOWN, timezone), [timezone]);
  const showPrices = config.brand.showPrices;
  const micBlocked = typeof window !== "undefined" && (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined" || !window.isSecureContext);
  const shownStaff = useMemo(() => eligibleStaff(staff, serviceIds), [staff, serviceIds]);
  const staffValid = staffId === "" || shownStaff.some((s) => s.id === staffId);

  /* ── سقف ضبط از تنظیمات سوپرادمین (مگابایت ویس) ──────────────────── */
  const [recordMaxSeconds, setRecordMaxSeconds] = useState(RECORD_MIN_SECONDS);
  useEffect(() => {
    void getUploadLimits().then((l) => {
      setRecordMaxSeconds(Math.max(RECORD_MIN_SECONDS, Math.floor(mbToBytes(l.voiceMaxMb) / BYTES_PER_SECOND)));
    });
  }, []);

  /* ── پیش‌پرکردن فرم دستی از حساب مشتری ───────────────────────────── */
  useEffect(() => {
    if (!isCustomer) return;
    setName((prev) => prev || me?.name || profile.name);
    setPhone((prev) => prev || profile.phone || me?.phone || "");
  }, [isCustomer, me?.name, me?.phone, profile.name, profile.phone]);

  /* ── روز پیش‌فرض = امروز، تا ساعت‌های خالی بی‌درنگ دیده شوند ─────── */
  useEffect(() => {
    if (!day && days.length) setDay(days[0]);
  }, [day, days]);

  /* ── تشخیص سالن این صفحه (همان زنجیرهٔ خانه) ─────────────────────── */
  useEffect(() => {
    if (!configReady || !authReady) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const resolved = await resolveHomeSalon({ search: location.search, me, favorites: favKey ? favKey.split(",") : [] });
      if (!alive) return;
      setHome(resolved);
      if (resolved.source === "none") {
        setSalon(null);
        setLoading(false);
        return;
      }
      const detail = await mapi<{ success: boolean; error?: string; salon?: MiniSalonDetail }>(`/api/salons/${encodeURIComponent(resolved.slug)}`);
      if (!alive) return;
      if (!detail.ok || !detail.data?.salon) {
        setSalon(null);
        setLoading(false);
        return;
      }
      setSalon(detail.data.salon);
      const staffRes = await mapi<{ success: boolean; staff?: MiniStaff[] }>(`/api/mini/staff?slug=${encodeURIComponent(resolved.slug)}`);
      if (alive) setStaff(staffRes.ok ? staffRes.data?.staff ?? [] : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [configReady, authReady, me, favKey, location.search]);

  /* ── شمارندۀ ثانیه‌های ضبط (با توقف خودکار روی سقف) ──────────────── */
  useEffect(() => {
    if (stage !== "recording") return;
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= recordMaxSeconds) {
          stopRecordingRef.current?.();
          return recordMaxSeconds;
        }
        return s + 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // stopRecordingRef پایدار است و در renderهای دوباره لازم نیست
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, recordMaxSeconds]);

  /** بستن کامل ضبط‌کننده و میکروفون */
  function releaseRecorder() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
  }

  useEffect(() => releaseRecorder, []);

  /* ── ساعت‌های خالی ────────────────────────────────────────────────── */
  const fetchSlots = useCallback(
    async (dateKey: string, ids: string[], employeeId: string): Promise<AvailabilityResponse | null> => {
      if (!salon || !dateKey || ids.length === 0) {
        setAvailability(null);
        return null;
      }
      setSlotsLoading(true);
      const params = new URLSearchParams({ date: dateKey, serviceIds: ids.join(",") });
      if (employeeId) params.set("employeeId", employeeId);
      const res = await mapi<AvailabilityResponse>(`/api/salons/${encodeURIComponent(salon.slug)}/availability?${params.toString()}`);
      setSlotsLoading(false);
      if (!res.ok) {
        setAvailability(null);
        return null;
      }
      setAvailability(res.data ?? null);
      return res.data ?? null;
    },
    [salon]
  );

  /* با تغییر روز/خدمت/آرایشگر، ساعت‌ها تازه می‌شوند و انتخاب بی‌اعتبار پاک می‌شود */
  useEffect(() => {
    startAtRef.current = startAt;
  }, [startAt]);

  useEffect(() => {
    if (!salon || !day || !serviceIds.length) {
      setAvailability(null);
      return;
    }
    void fetchSlots(day, serviceIds, staffValid ? staffId : "").then((data) => {
      if (startAtRef.current && data && !data.slots.some((s) => s.startAt === startAtRef.current)) setStartAt("");
    });
  }, [salon, day, serviceIds, staffId, staffValid, fetchSlots]);

  /* ── ثبت نوبت (مشترکِ هر دو حالت) ────────────────────────────────── */
  async function submit(
    source: Mode,
    override?: { startAtIso?: string; serviceId?: string; name?: string; phone?: string; note?: string; voiceCallId?: string }
  ): Promise<boolean> {
    if (!salon) return false;
    // در مسیر صوتی، مقدارِ تازهٔ استخراج‌شده مستقیم پاس داده می‌شود؛ انتظار flush شدن state نمی‌رود
    const cleanName = String(override?.name ?? name).trim();
    const cleanPhone = normalizePhone(String(override?.phone ?? phone));
    if (cleanName.length < 2) {
      setMsg("نام مشتری را کامل بنویسید.");
      toast("نام را کامل بنویسید", "error");
      return false;
    }
    if (!isPhone(cleanPhone)) {
      setMsg("شماره موبایل معتبر نیست؛ مثال ۰۹۱۲۳۴۵۶۷۸۹.");
      toast("شماره موبایل معتبر نیست", "error");
      return false;
    }
    const iso = override?.startAtIso ?? startAt;
    if (!iso) {
      setMsg("ساعت نوبت مشخص نیست؛ از فهرست ساعت‌های آزاد انتخاب کنید.");
      return false;
    }
    const ids = override?.serviceId ? [override.serviceId] : serviceIds;
    setBusy(true);
    setMsg("");
    const res = await mapi<{ success: boolean; error?: string; appointment?: { id: string; startAt: string; depositAmount?: number } }>("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        salonId: salon.id,
        serviceIds: ids.length ? ids : undefined,
        employeeId: staffValid && staffId ? staffId : undefined,
        customerName: cleanName,
        customerPhone: cleanPhone,
        startAt: iso,
        channel: source === "ai" ? "VOICE" : "MANUAL",
        voiceCallId: source === "ai" ? (override?.voiceCallId ?? voiceCallId) || undefined : undefined,
        note: (override?.note ?? note).trim() || undefined,
      }),
    });
    setBusy(false);
    const appointment = res.ok ? res.data?.appointment : undefined;
    if (!appointment) {
      const error = res.data?.error || "ثبت نوبت ممکن نشد؛ دوباره تلاش کنید.";
      setStage("needs");
      setMsg(error);
      toast(error, "error");
      return false;
    }
    if (isCustomer) saveProfile({ name: cleanName, phone: cleanPhone });
    haptic("success");
    setBooked({
      id: appointment.id,
      startAt: appointment.startAt,
      name: cleanName,
      phone: cleanPhone,
      service: salon.services.find((s) => s.id === (ids[0] ?? ""))?.name ?? extracted?.service,
    });
    setStage("done");
    setMsg("");
    return true;
  }

  /* ── تبدیل گفتار/متن به اطلاعات نوبت ─────────────────────────────── */
  async function transcribe(source: { audio?: Blob | File; text?: string }, onlyField?: FieldKey) {
    if (!salon) return;
    // پیش‌بررسی حجم با سقف پویای سوپرادمین (بررسی قطعی سمت سرور است)
    if (source.audio && source.audio.size > mbToBytes(uploadLimitsSync().voiceMaxMb)) {
      const error = `حجم فایل صوتی ${sizeHintFa(uploadLimitsSync().voiceMaxMb)} است.`;
      setMsg(error);
      toast(error, "error");
      return;
    }
    setMsg("");
    setAdjusted("");
    setShowText(false);
    setStage("working");
    const cleanPhone = normalizePhone(phone);
    const form = new FormData();
    if (source.audio) form.append("audio", source.audio, "rec.webm");
    if (source.text) form.append("text", source.text);
    form.append("salonId", salon.id);
    if (cleanPhone) form.append("phone", cleanPhone);
    if (extracted) form.append("partial", JSON.stringify(extracted));
    if (voiceCallId) form.append("voiceCallId", voiceCallId);
    if (onlyField) form.append("field", onlyField);

    const res = await mapi<{
      success: boolean;
      error?: string;
      transcript?: string;
      voiceCallId?: string;
      extracted?: Extracted;
    }>("/api/voice/transcribe", { method: "POST", body: form });

    if (!res.ok || !res.data?.success) {
      const error = res.data?.error || "تبدیل گفتار ممکن نشد.";
      setStage("needs");
      setPendingField(null);
      setMsg(error);
      toast(error, "error");
      return;
    }

    const textSpoken = String(res.data.transcript ?? "");
    const ex: Extracted = res.data.extracted ?? {};
    const callId = res.data.voiceCallId ?? voiceCallId;
    if (res.data.voiceCallId) setVoiceCallId(res.data.voiceCallId);
    setTranscript(textSpoken);
    setExtracted(ex);
    if (onlyField) setPendingField(null);
    if (ex.name) setName(ex.name);
    if (ex.phone) setPhone(normalizePhone(ex.phone));
    const spokenService = ex.service ?? "";
    const serviceId = matchServiceId(salon, spokenService);
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(ex.date ?? "")) ? String(ex.date) : "";
    const clock = normalizeClock(String(ex.time ?? ""));

    const nextMissing = REQUIRED_FIELDS.filter((f) => {
      if (f === "name") return !ex.name;
      if (f === "phone") return !isPhone(String(ex.phone ?? ""));
      if (f === "date") return !dateKey;
      return !clock;
    });
    setMissing(nextMissing);

    // هر چه فهمیده شده حتی در حالت ناقص هم در فرم می‌نشیند (روز و خدمتِ درست، ساعت‌های همان روز)
    if (serviceId) setServiceIds([serviceId]);
    if (dateKey) setDay(dateKey);

    if (nextMissing.length > 0) {
      setStage("needs");
      setMsg(`«${nextMissing.map((f) => FIELD_LABELS[f]).join("، ")}» را متوجه نشدم — یک‌بار همان را بگویید یا بنویسید.`);
      return;
    }

    // همه‌چیز هست: خدمت + روز + ساعت → تطبیق با وقت‌های واقعی
    const ids = serviceId ? [serviceId] : [];
    if (!ids.length) {
      setStage("needs");
      setMsg(`«${spokenService || "خدمت"}» در لیست خدمات این سالن پیدا نشد — یکی را انتخاب کنید.`);
      return;
    }
    const av = await fetchSlots(dateKey, ids, staffValid && staffId ? staffId : "");
    const slots = av?.slots ?? [];
    if (!slots.length) {
      setStage("needs");
      setMsg(`در ${dayLabel(dateKey, timezone)} وقت خالی‌ای نیست. یک روز دیگر را انتخاب کنید.`);
      return;
    }
    const exact = slots.find((s) => clockInSalonTz(s.startAt, av?.timezone || timezone) === clock);
    const chosen = exact ?? slots[0];
    setStartAt(chosen.startAt);
    if (!exact) {
      // ساعت گفته‌شده پر است: نزدیک‌ترین وقتِ آزاد ثبت می‌شود و همان‌جا به مشتری گفته می‌شود
      setAdjusted(`ساعت ${faDigits(clock)} در ${dayLabel(dateKey, timezone)} آزاد نبود؛ نزدیک‌ترین وقت (${timeLabel(chosen.startAt, timezone)}) ثبت شد.`);
    }
    // مقادیر استخراج‌شده مستقیم پاس می‌شوند (state هنوز در همین تیک تازه نشده است)
    const ok = await submit("ai", {
      serviceId: ids[0],
      startAtIso: chosen.startAt,
      name: ex.name,
      phone: normalizePhone(String(ex.phone ?? "")),
      voiceCallId: callId,
    });
    if (ok) {
      if (exact) autoBookedRef.current = true;
      return;
    }
    if (!exact) setMsg(`ساعت ${faDigits(clock)} آن روز آزاد نبود؛ نزدیک‌ترین وقت (${timeLabel(chosen.startAt, timezone)}) انتخاب شد — از فرم پایین تأیید کنید.`);
  }

  /* ── ضبط ویس ─────────────────────────────────────────────────────── */
  function stopRecording() {
    const mr = recRef.current;
    if (!mr || mr.state === "inactive") {
      releaseRecorder();
      return;
    }
    mr.stop();
    releaseRecorder();
    setStage("working");
  }
  stopRecordingRef.current = stopRecording;

  function startRecording() {
    if (!salon) return;
    setMsg("");
    if (micBlocked) {
      setShowText(true);
      setMsg("میکروفون روی این آدرس قفل است (یا اتصال امن نیست). فایل صوتی بفرستید یا جمله را بنویسید.");
      return;
    }
    autoBookedRef.current = false;
    setSeconds(0);
    const fieldForThisTake = pendingField ?? undefined;
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
        const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        chunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        mr.onstop = () => {
          const type = mr.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type });
          void transcribe({ audio: blob }, fieldForThisTake);
        };
        mr.start();
        recRef.current = mr;
        streamRef.current = stream;
        setStage("recording");
      })
      .catch(() => {
        releaseRecorder();
        setStage("idle");
        setShowText(true);
        setMsg("دسترسی به میکروفون ممکن نیست؛ یا اجازهٔ ضبط را نداده‌اید یا این آدرس امن (https) نیست.");
      });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    autoBookedRef.current = false;
    void transcribe({ audio: file }, pendingField ?? undefined);
  }

  function submitTyped() {
    const text = typed.trim();
    if (text.length < 3) {
      setMsg("کمی کامل‌تر بنویسید؛ مثلاً «فردا ۱۰ صبح کوتاهی مو، سارا احمدی، ۰۹۱۲۳۴۵۶۷۸۹».");
      return;
    }
    autoBookedRef.current = false;
    void transcribe({ text }, pendingField ?? undefined);
  }

  /** اصلاح یک فیلد در حالت تکمیل — extracted هم به‌روز می‌شود تا در گفتار بعدی گم نشود */
  function fillField(field: FieldKey, value: string) {
    const next = { ...(extracted ?? {}) } as Extracted;
    if (value) next[field] = value;
    else delete next[field];
    setExtracted(next);
    if (field === "name") setName(value);
    if (field === "phone") setPhone(value);
    if (field === "service") {
      const id = matchServiceId(salon, value);
      if (id) setServiceIds([id]);
    }
    if (field === "date") setDay(value);
    if (field === "time") setStartAt("");
  }

  /** تکمیل نوبت پس از گفتار: ساعت انتخاب‌شده ثبت می‌شود؛ اگر فقط از صدا باشد، همان ساعت در وقت‌های آزاد جست‌وجو می‌شود */
  async function confirmMissing() {
    if (!salon) return;
    if (!serviceIds.length) {
      setMsg("یک خدمت انتخاب کنید تا ساعت‌های آزاد همان خدمت دیده شود.");
      return;
    }
    if (startAt) {
      await submit(mode === "ai" ? "ai" : "manual");
      return;
    }
    const clock = normalizeClock(String(extracted?.time ?? ""));
    if (!clock) {
      setMsg("ساعت را بگویید یا از فهرست ساعت‌های آزاد یکی را بزنید.");
      return;
    }
    const av = await fetchSlots(day, serviceIds, staffValid && staffId ? staffId : "");
    const hit = (av?.slots ?? []).find((s) => clockInSalonTz(s.startAt, av?.timezone || timezone) === clock);
    if (!hit) {
      setMsg(`ساعت ${faDigits(clock)} در ${dayLabel(day, timezone)} آزاد نیست؛ از ساعت‌های پایین انتخاب کنید.`);
      return;
    }
    setStartAt(hit.startAt);
    await submit(mode === "ai" ? "ai" : "manual", { startAtIso: hit.startAt });
  }

  function reset() {
    releaseRecorder();
    autoBookedRef.current = false;
    setStage("idle");
    setBooked(null);
    setTranscript("");
    setExtracted(null);
    setMissing([]);
    setPendingField(null);
    setVoiceCallId("");
    setMsg("");
    setTyped("");
    setAdjusted("");
    setShowText(false);
    setStartAt("");
    setSeconds(0);
    setNote("");
  }

  /* ── نمایش نتیجه ─────────────────────────────────────────────────── */
  if (loading && !salon) {
    return (
      <div className="mini-fade">
        <SectionTitle title="رزرو با هوش مصنوعی و دستی" />
        <SkeletonList count={4} />
      </div>
    );
  }

  if (!salon) {
    return (
      <div className="mini-fade">
        <EmptyState
          text="برای رزرو، اول سالن را اضافه کنید"
          hint="این صفحه به سالن شما یا سالنی که با کیو‌آر/لینک اضافه کرده‌اید نیاز دارد."
        />
        <div className="mini-actions" style={{ marginTop: 12 }}>
          <Button variant="ghost" onClick={() => navigate("/mini")}>
            <Icon name="home" size={17} />
            خانه
          </Button>
          <Button onClick={() => navigate("/mini/favorites")}>
            <Icon name="star" size={17} />
            علاقه‌مندی‌ها
          </Button>
        </div>
      </div>
    );
  }

  const hasTranscript = Boolean(transcript);
  const processing = stage === "working" || busy;
  const steps: { title: string; desc: string; state: "idle" | "active" | "done" }[] = [
    {
      title: "شنیدن صدای شما",
      desc: stage === "recording" ? `در حال ضبط… ${mmss(seconds)}` : hasTranscript ? "صدا گرفته شد" : "با یک لمس شروع می‌شود",
      state: stage === "recording" ? "active" : hasTranscript ? "done" : "idle",
    },
    {
      title: "تبدیل گفتار به متن",
      desc: hasTranscript ? "گفتار فارسی به متن تبدیل شد" : processing && !hasTranscript ? "در حال تبدیل…" : "خودکار با سرویس رزرو صوتی",
      state: hasTranscript ? "done" : processing && !hasTranscript ? "active" : "idle",
    },
    {
      title: "تشخیص نام، شماره و زمان",
      desc: extracted
        ? missing.length > 0
          ? `ناقص: ${missing.map((f) => FIELD_LABELS[f]).join("، ")}`
          : "همهٔ اطلاعات پیدا شد"
        : hasTranscript
          ? "در حال تشخیص…"
          : "خودکار",
      state: extracted ? "done" : hasTranscript ? "active" : "idle",
    },
    {
      title: "تطبیق با ساعت آزاد و ثبت نوبت",
      desc: booked ? "نوبت ثبت شد" : processing && hasTranscript ? "در حال ثبت…" : "اگر ساعت پر باشد، نزدیک‌ترین وقت پیشنهاد می‌شود",
      state: booked ? "done" : processing && extracted ? "active" : "idle",
    },
  ];

  return (
    <div className="mini-fade" dir="rtl">
      <SectionTitle title="رزرو با هوش مصنوعی و دستی" hint={`${salon.name}${home ? ` · ${SOURCE_LABEL[home.source]}` : ""}`} />

      {!config.features.booking ? (
        <div className="mini-note">رزرو آنلاین از سمت سوپرادمین غیرفعال شده است. برای همین فقط راهنمای تماس در دسترس است.</div>
      ) : (
        <>
          <Tabs<Mode>
            value={mode}
            onChange={(m) => {
              setMode(m);
              setMsg("");
            }}
            items={[
              { id: "ai", label: "با صدا (هوش مصنوعی)", icon: "mic" },
              { id: "manual", label: "دستی", icon: "edit" },
            ]}
          />

          {mode === "ai" ? (
            booked ? (
              <div className="mini-vb-done">
                <div className="mini-vb-done-title">
                  <Icon name="check" size={20} />
                  نوبت ثبت شد
                </div>
                <Row label="نام" value={booked.name ?? name} />
                {booked.phone ? <Row label="شماره" value={faDigits(booked.phone)} /> : null}
                {booked.service ? <Row label="خدمت" value={booked.service} /> : null}
                <Row label="زمان" value={fullLabel(booked.startAt, timezone)} />
                <Row label="سالن" value={salon.name} />
                {adjusted ? (
                  <div className="mini-note is-warn" style={{ marginTop: 10 }}>
                    {adjusted}
                  </div>
                ) : null}
                {transcript ? (
                  <div className="mini-vb-quote">
                    <b>چیزی که فهمیدیم</b>
                    <p>«{transcript}»</p>
                  </div>
                ) : null}
                <div className="mini-note" style={{ marginTop: 10 }}>
                  پیامک تأیید و یادآوری همان قوانین همیشگی سالن برایتان می‌آید. بیعانه داشته باشید از «نوبت‌های من» پرداخت می‌شود.
                </div>
                <div className="mini-actions" style={{ marginTop: 12 }}>
                  <Button onClick={() => navigate("/mini/appointments")}>
                    <Icon name="calendar" size={17} />
                    نوبت‌های من
                  </Button>
                  <Button variant="ghost" onClick={reset}>
                    <Icon name="mic" size={17} />
                    نوبت جدید
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mini-vb-mic">
                  <button
                    type="button"
                    className={`mini-vb-orb${stage === "recording" ? " is-rec" : ""}`}
                    onClick={() => (stage === "recording" ? stopRecording() : startRecording())}
                    disabled={processing}
                    aria-label={stage === "recording" ? "پایان ضبط" : "شروع ضبط صدا"}
                  >
                    <Icon name={stage === "recording" ? "stop" : processing ? "refresh" : "mic"} size={stage === "recording" ? 34 : 40} />
                  </button>
                  <p role="status" aria-live="polite" className="mini-vb-status">
                    {stage === "recording"
                      ? `در حال شنیدن… ${mmss(seconds)}`
                      : processing
                        ? "در حال پردازش…"
                        : pendingField
                          ? `فقط «${FIELD_LABELS[pendingField]}» را بگویید`
                          : stage === "needs"
                            ? "یک‌بار دیگر بگویید یا موارد مانده را کامل کنید"
                            : "لمس کنید و یک جملهٔ کامل بگویید"}
                  </p>
                  <p className="mini-vb-sub">
                    {pendingField
                      ? "این بار همین یک مورد را جدا می‌گیریم و بقیهٔ اطلاعات حفظ می‌شود."
                      : "نام، شماره، خدمت، روز و ساعت را در یک جمله بگویید؛ بقیه خودکار."}
                  </p>
                </div>

                <div className="mini-vb-sample">
                  <b>
                    <Icon name="sparkle" size={14} /> متن نمونه
                  </b>
                  <p>«{SAMPLE_SCRIPT}»</p>
                  <span>جای نام و شماره را با اطلاعات واقعی خودتان بگذارید.</span>
                </div>

                {micBlocked && <div className="mini-note">میکروفون این آدرس قفل است (http). فایل صوتی بفرستید یا جمله را بنویسید.</div>}

                <div className="mini-vb-alt">
                  {showText ? (
                    <>
                      <button type="button" className="mini-chip" onClick={() => fileRef.current?.click()}>
                        <Icon name="bolt" size={14} /> فایل صوتی
                      </button>
                      <button type="button" className="mini-chip is-on" onClick={() => setShowText(false)}>
                        <Icon name="edit" size={14} /> نوشتن جمله
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="mini-chip" onClick={() => fileRef.current?.click()}>
                        <Icon name="bolt" size={14} /> فایل صوتی
                      </button>
                      <button type="button" className="mini-chip" onClick={() => setShowText(true)}>
                        <Icon name="edit" size={14} /> میکروفون ندارید؟ بنویسید
                      </button>
                    </>
                  )}
                  <input ref={fileRef} type="file" accept="audio/*,.ogg,.webm,.mp3,.wav,.m4a,.aac" className="hidden-file" onChange={onPickFile} />
                </div>

                {showText && (
                  <div className="mini-vb-type">
                    <Area
                      label={missing.length ? `فقط این‌ها را بنویسید: ${missing.map((f) => FIELD_LABELS[f]).join("، ")}` : "جملهٔ رزرو را بنویسید"}
                      name="vb_text"
                      rows={3}
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      placeholder="فردا ۱۰ صبح کوتاهی مو، سارا احمدی، ۰۹۱۲۳۴۵۶۷۸۹"
                    />
                    <Button onClick={submitTyped} loading={processing}>
                      <Icon name="sparkle" size={17} />
                      تبدیل و ثبت
                    </Button>
                  </div>
                )}

                <ol className="mini-vb-steps">
                  {steps.map((s, i) => (
                    <li key={s.title} className="mini-vb-step">
                      <span className={`mini-vb-dot${s.state === "done" ? " is-done" : s.state === "active" ? " is-active" : ""}`}>
                        {s.state === "done" ? <Icon name="check" size={14} /> : s.state === "active" ? <Icon name="refresh" size={14} /> : faDigits(i + 1)}
                      </span>
                      <div className="mini-vb-step-body">
                        <b className={s.state === "idle" ? "is-idle" : ""}>{s.title}</b>
                        <span>{s.desc}</span>
                        {i === 1 && hasTranscript && <em>«{transcript}»</em>}
                      </div>
                    </li>
                  ))}
                </ol>

                {extracted && (
                  <div className="mini-vb-chips">
                    {(["name", "phone", "service", "date", "time"] as FieldKey[])
                      .filter((k) => Boolean(extracted[k]))
                      .map((k) => (
                        <span key={k} className="mini-vb-chip">
                          <Icon name="check" size={12} />
                          {FIELD_LABELS[k]}: {k === "date" ? dayLabel(String(extracted[k]), timezone) : k === "time" || k === "phone" ? faDigits(String(extracted[k])) : String(extracted[k])}
                        </span>
                      ))}
                  </div>
                )}

                {msg && !booked && <div className="mini-note is-warn">{msg}</div>}

                {stage === "needs" && !booked && (
                  <div className="mini-vb-needs">
                    <SectionTitle title="تکمیل نوبت" hint="بقیه از گفتار شما گرفته شد" />
                    {missing.length > 0 && (
                      <div className="mini-vb-ask">
                        <span>فقط همان را بگویید:</span>
                        {missing.map((f) => (
                          <button
                            key={f}
                            type="button"
                            className={`mini-chip${pendingField === f ? " is-on" : ""}`}
                            onClick={() => {
                              setPendingField(pendingField === f ? null : f);
                              setMsg(pendingField === f ? "" : `حالا فقط «${FIELD_LABELS[f]}» را بگویید — یا همان را در فرم پایین پر کنید.`);
                            }}
                          >
                            <Icon name="mic" size={13} />
                            {FIELD_LABELS[f]}
                          </button>
                        ))}
                      </div>
                    )}
                    {(missing.includes("name") || !missing.length) && <Field label="نام" name="vb_name" value={name} onChange={(e) => fillField("name", e.target.value)} placeholder="مثلاً مریم رضایی" />}
                    {(missing.includes("phone") || !missing.length) && (
                      <Field label="شماره موبایل" name="vb_phone" dir="ltr" inputMode="numeric" value={phone} onChange={(e) => fillField("phone", e.target.value)} placeholder="09123456789" />
                    )}
                    <div className="mini-vb-services">
                      <b>خدمت</b>
                      <ServicePicker
                        services={salon.services}
                        selected={serviceIds}
                        showPrices={showPrices}
                        onToggle={(id) => setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id]))}
                      />
                    </div>
                    <SectionTitle title="روز" hint={relativeDayLabel(day, timezone)} />
                    <DayStrip days={days} value={day || days[0]} timezone={timezone} onChange={(d) => setDay(d)} />
                    <SectionTitle title="ساعت" hint={serviceIds.length ? `${faDigits(availability?.slots.length ?? 0)} وقت خالی` : "اول یک خدمت انتخاب کنید"} />
                    <SlotGrid
                      slots={availability?.slots ?? []}
                      value={startAt}
                      timezone={timezone}
                      loading={slotsLoading}
                      emptyText={serviceIds.length ? "در این روز وقت خالی نیست؛ روز دیگر را انتخاب کنید." : "برای دیدن ساعت‌های آزاد، خدمت را انتخاب کنید."}
                      onSelect={(iso) => {
                        setStartAt(iso);
                        haptic("light");
                      }}
                    />
                    <div className="mini-actions" style={{ marginTop: 12 }}>
                      <Button onClick={() => void confirmMissing()} loading={busy} disabled={!serviceIds.length || !startAt}>
                        <Icon name="calendar" size={17} />
                        ثبت نوبت
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setPendingField(null);
                          startRecording();
                        }}
                        disabled={processing}
                      >
                        <Icon name="mic" size={17} />
                        دوباره بگویید
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )
          ) : (
            /* ── حالت دستی ───────────────────────────────────────────── */
            <div className="mini-vb-manual">
              {booked ? (
                <div className="mini-vb-done">
                  <div className="mini-vb-done-title">
                    <Icon name="check" size={20} />
                    نوبت ثبت شد
                  </div>
                  <Row label="نام" value={booked.name ?? name} />
                  {booked.phone ? <Row label="شماره" value={faDigits(booked.phone)} /> : null}
                  {booked.service ? <Row label="خدمت" value={booked.service} /> : null}
                  <Row label="زمان" value={fullLabel(booked.startAt, timezone)} />
                  <Row label="سالن" value={salon.name} />
                  <div className="mini-actions" style={{ marginTop: 12 }}>
                    <Button onClick={() => navigate("/mini/appointments")}>
                      <Icon name="calendar" size={17} />
                      نوبت‌های من
                    </Button>
                    <Button variant="ghost" onClick={reset}>
                      نوبت جدید
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <SectionTitle title="خدمت" hint="یکی یا چند مورد" />
                  <ServicePicker
                    services={salon.services}
                    selected={serviceIds}
                    showPrices={showPrices}
                    onToggle={(id) => setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                  />

                  {shownStaff.length > 0 && (
                    <>
                      <SectionTitle title="آرایشگر" hint="اختیاری" />
                      <StaffPicker
                        staff={shownStaff}
                        value={staffValid ? staffId : ""}
                        onChange={(id) => {
                          setStaffId(id);
                          setStartAt("");
                        }}
                      />
                    </>
                  )}

                  <SectionTitle title="روز" hint={relativeDayLabel(day, timezone)} />
                  <DayStrip
                    days={days}
                    value={day || days[0]}
                    timezone={timezone}
                    onChange={(d) => {
                      setDay(d);
                      setStartAt("");
                    }}
                  />

                  <SectionTitle title="ساعت" hint={serviceIds.length ? `${faDigits(availability?.slots.length ?? 0)} وقت خالی` : "اول خدمت را انتخاب کنید"} />
                  <SlotGrid
                    slots={availability?.slots ?? []}
                    value={startAt}
                    timezone={timezone}
                    loading={slotsLoading}
                    emptyText={serviceIds.length ? "در این روز وقت خالی نیست؛ روز دیگری را انتخاب کنید." : "برای دیدن ساعت‌های آزاد، خدمت را انتخاب کنید."}
                    onSelect={(iso) => {
                      setStartAt(iso);
                      haptic("light");
                    }}
                  />

                  <Field label="نام" name="mn_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً مریم رضایی" />
                  <Field label="شماره موبایل" name="mn_phone" dir="ltr" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" />
                  <Area label="توضیح (اختیاری)" name="mn_note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً رنگ مو تیره نباشد" />

                  {startAt && (
                    <div className="mini-card" style={{ marginTop: 12 }}>
                      <Row label="زمان نوبت" value={fullLabel(startAt, timezone)} />
                      {serviceIds.length > 0 && (
                        <Row
                          label="قیمت تقریبی"
                          value={toman(salon.services.filter((s) => serviceIds.includes(s.id)).reduce((a, s) => a + Number(s.price || 0), 0))}
                        />
                      )}
                    </div>
                  )}

                  {msg && <div className="mini-note is-warn" style={{ marginTop: 10 }}>{msg}</div>}

                  <Button
                    style={{ marginTop: 12 }}
                    onClick={() => void submit("manual")}
                    loading={busy}
                    disabled={!serviceIds.length || !startAt || !name.trim() || !isPhone(normalizePhone(phone))}
                  >
                    <Icon name="calendar" size={17} />
                    ثبت نوبت دستی
                  </Button>
                  <div className="mini-option-sub" style={{ marginTop: 10, textAlign: "center", lineHeight: 1.9 }}>
                    با ثبت، نوبت در همان سیستم سالن قرار می‌گیرد و پیامک تأیید می‌آید.
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** ثانیه‌ها به شکل «۰۰:۱۲» با رقم فارسی */
function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return faDigits(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
}
