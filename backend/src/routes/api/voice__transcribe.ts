// خودکار: پورت‌شده از src/app/api/voice/transcribe/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { transcribeWithFallback, type SttProvider } from "@/lib/ai/stt";
import { extractAppointment, extractSingleField, type ExtractedAppointment, type ExtractedField } from "@/lib/ai/parser";
import { isAnyStaffPhrase, matchService, matchStaff, type CatalogItem } from "@/lib/ai/catalog-match";
import { mergeExtracted } from "@/lib/ai/merge";
import { storeFile } from "@/lib/storage";
import { withinLimit } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";
import { checkRate, clientIpFromRequest, numericSettingOrEnv, tooManyRequests } from "@/lib/rate-limit-lite";
import { uploadLimits } from "@/lib/upload-limits";
import {
  normalizeMime,
  safeUploadName,
  validateAudioContent,
  type AudioMime,
} from "@/lib/upload-validation";

const FIELDS: ExtractedField[] = ["name", "phone", "service", "staff", "date", "time"];

type StaffRow = { id: string; name: string; serviceIds: string[] };

/**
 * پکیج و آرایشگرِ گفته‌شده را به شناسهٔ واقعیِ همان سالن نگاشت می‌کند.
 * پکیج اجباری است: اگر تطبیق مبهم باشد (چند گزینه هم‌امتیاز) شناسه خالی می‌ماند و
 * فهرست گزینه‌ها برمی‌گردد تا مشتری خودش انتخاب کند — نه اینکه یکی به‌زور ثبت شود.
 * آرایشگر اختیاری است و فقط از میان کسانی که آن پکیج را انجام می‌دهند انتخاب می‌شود.
 */
function resolveCatalog(
  extracted: Partial<ExtractedAppointment>,
  transcript: string,
  services: CatalogItem[],
  staff: StaffRow[]
) {
  const serviceMatch = extracted.service ? matchService(extracted.service, services) : null;
  const serviceId = serviceMatch && !serviceMatch.ambiguous ? serviceMatch.id : "";
  const eligible = staff.filter((s) => !serviceId || s.serviceIds.length === 0 || s.serviceIds.includes(serviceId));
  const staffMatch = extracted.staff
    ? matchStaff(extracted.staff, eligible, { exclude: [extracted.name ?? ""] })
    : null;
  const staffId = staffMatch && !staffMatch.ambiguous ? staffMatch.id : "";
  return {
    serviceId,
    staffId,
    staffAny: isAnyStaffPhrase(transcript) || isAnyStaffPhrase(extracted.staff ?? ""),
    serviceCandidates: serviceMatch?.ambiguous ? serviceMatch.candidates : [],
    staffCandidates: staffMatch?.ambiguous ? staffMatch.candidates : [],
  };
}

/** فرمت‌های صوتی مجاز — MediaRecorder مرورگرها معمولاً webm یا mp4 می‌دهد */
const AUDIO_TYPES: readonly AudioMime[] = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/aac"];

/**
 * دریافت فایل صوتی، تبدیل گفتار فارسی به متن (Whisper)
 * و استخراج اطلاعات نوبت. نتیجه برای تأیید مشتری برمی‌گردد.
 *
 * حالت دوم (پرسش مجدد فیلد): اگر ربات فیلدی را نفهمید، مشتری فقط همان
 * فیلد را می‌گوید؛ با پارامترهای `field` و `partial` مقدار جدید با نتیجه
 * قبلی ادغام می‌شود و خروجی کامل دوباره در دیتابیس ثبت می‌گردد.
 *
 * حالت سوم (بدون میکروفون): روی بستر ناامن (http) مرورگر میکروفون را قفل می‌کند،
 * پس اگر به‌جای `audio` فیلد `text` بیاید، همان متن به‌عنوان گفتارِ تبدیل‌شده
 * استفاده و فقط مرحلهٔ استخراج اجرا می‌شود. آپلود فایل صوتی هم از همین مسیر
 * عبور می‌کند (فقط `audio` بدون `getUserMedia`).
 */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    // سقف حجم و نرخ — پیش از خواندن/پارس بدنهٔ multipart (این endpoint عمومی است)
    // حجم از تنظیمات پویا: upload.voice_max_mb (پنل) با تقدم کلید بایتی قدیمی voice.max_upload_bytes
    const ip = clientIpFromRequest(req);
    const { voiceMaxBytes: maxBytes } = await uploadLimits();
    const declaredSize = Number(req.headers.get("content-length") ?? "0");
    // سربار multipart (بانداری و فیلدهای متنی) تا ۱ مگابایت لحاظ می‌شود؛
    // حجم واقعی خودِ فایل بعد از پارس با audio.size سنجیده می‌شود.
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes + 1024 * 1024) {
      return json({ success: false, error: `حجم فایل صوتی بیش از سقف مجاز (${Math.round(maxBytes / 1024 / 1024)} مگابایت) است` }, { status: 413 });
    }
    const perHour = await numericSettingOrEnv("voice.rate_per_hour", process.env.VOICE_RATE_PER_HOUR, 40);
    if (perHour > 0) {
      const minute = checkRate(`voice:${ip}`, Math.max(2, Math.ceil(perHour / 12)), 60_000);
      if (!minute.ok) return tooManyRequests(minute.retryAfterSec, "چند لحظه صبر سپس دوباره ضبط کنید.");
      const hour = checkRate(`voice-hour:${ip}`, perHour, 3_600_000);
      if (!hour.ok) return tooManyRequests(hour.retryAfterSec, "سقف تبدیل گفتار این ساعت پر شده است.");
    }

    const form = await req.formData();
    const audio = form.get("audio") as File | null;
    const salonId = (form.get("salonId") as string) ?? "";
    const userPhone = (form.get("phone") as string) ?? "";
    const field = (form.get("field") as string) ?? "";
    const partialRaw = (form.get("partial") as string) ?? "";
    const voiceCallId = (form.get("voiceCallId") as string) ?? "";
    const typedText = ((form.get("text") as string) ?? "").trim();

    if (!audio && !typedText) return json({ success: false, error: "فایل صوتی یا متن ارسال نشده است" }, { status: 400 });
    if (!salonId) return json({ success: false, error: "salonId الزامی است" }, { status: 400 });
    if (field && !FIELDS.includes(field as ExtractedField)) {
      return json({ success: false, error: "فیلد نامعتبر است" }, { status: 400 });
    }

    const salon = await prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    if (!(await withinLimit(salonId, "voiceBooking"))) {
      return json(
        { success: false, error: "رزرو صوتی در پلن فعلی این سالن فعال نیست. برای ارتقای پلن به بخش اشتراک مراجعه کنید." },
        { status: 403 }
      );
    }

    // بررسی مجدد حجم واقعی فایل (content-length می‌تواند غلط باشد)
    if (audio && audio.size > maxBytes) {
      return json({ success: false, error: `حجم فایل صوتی بیش از سقف مجاز (${Math.round(maxBytes / 1024 / 1024)} مگابایت) است` }, { status: 413 });
    }

    // این مسیر عمومی و بدون احراز هویت است؛ پس نوع فایل نه از نام و نه از MIME
    // ادعایی، بلکه از محتوای واقعی (magic bytes) تعیین می‌شود.
    let detectedAudio: AudioMime | null = null;
    if (audio) {
      const declared = normalizeMime(audio.type);
      if (!AUDIO_TYPES.includes(declared as AudioMime)) {
        return json({ success: false, error: "فرمت فایل صوتی مجاز نیست (WebM، MP4، OGG، MP3 یا WAV)" }, { status: 400 });
      }
      try {
        detectedAudio = await validateAudioContent(audio, AUDIO_TYPES);
      } catch {
        return json({ success: false, error: "فایل واقعاً صوت نیست" }, { status: 400 });
      }
    }

    // ذخیره فایل صوتی (Blob در پروداکشن، محلی در توسعه) — در حالت متنی فایلی نیست
    let stored: { url: string } | null = null;
    let transcript: string;
    let provider: SttProvider | "text";

    if (audio) {
      stored = await storeFile(audio, { dir: "voice", mime: detectedAudio ?? undefined });
      const buffer = Buffer.from(await audio.arrayBuffer());
      // پردازش با زنجیره ربات‌های STT (OpenAI → Groq → Mock)
      const stt = await transcribeWithFallback(new Uint8Array(buffer), {
        filename: safeUploadName(audio.name, detectedAudio ?? undefined),
        mimeType: detectedAudio ?? normalizeMime(audio.type),
      });
      transcript = stt.transcript;
      provider = stt.provider;
    } else {
      // ورودی تایپ‌شده (پشتیبانِ میکروفون روی بستر ناامن): بدون STT، فقط استخراج
      transcript = typedText;
      provider = "text";
    }

    // کاتالوگ واقعی سالن: پکیج‌ها و آرایشگرها — تطبیق گفتار فقط با همین‌ها انجام می‌شود
    const services = await prisma.service.findMany({
      where: { salonId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const serviceNames = services.map((s) => s.name);
    const staffRows = await prisma.staff.findMany({
      where: { salonId, isActive: true },
      select: { id: true, name: true, services: { select: { id: true } } },
      orderBy: { name: "asc" },
      take: 60,
    });
    const staff: StaffRow[] = staffRows.map((s) => ({ id: s.id, name: s.name, serviceIds: s.services.map((x) => x.id) }));
    const staffNames = staff.map((s) => s.name);

    // ── حالت پرسش مجدد: فقط یک فیلد از صوت کوتاه استخراج و ادغام می‌شود ──
    if (field) {
      let partial: Partial<ExtractedAppointment> = {};
      try {
        partial = partialRaw ? (JSON.parse(partialRaw) as Partial<ExtractedAppointment>) : {};
      } catch {
        partial = {};
      }

      const single = await extractSingleField(field as ExtractedField, transcript, {
        timezone: salon.timezone,
        serviceNames,
        staffNames,
        customerName: partial.name,
      });
      const value = single[field as ExtractedField] as string | undefined;
      const extracted: Partial<ExtractedAppointment> = mergeExtracted(partial, value ? ({ [field]: value } as Partial<ExtractedAppointment>) : {});

      // ادغام و ثبت مجدد در همان رکورد تماس صوتی (خروجی کامل → دیتابیس)
      let recordId = voiceCallId;
      if (recordId) {
        const existing = await prisma.voiceCall.findUnique({ where: { id: recordId } });
        if (!existing || existing.salonId !== salonId) recordId = "";
      }
      if (!recordId) {
        const vc = await prisma.voiceCall.create({
          data: {
            salonId,
            audioUrl: stored?.url ?? null,
            durationSec: audio ? Math.round(audio.size / 8000) : null,
            status: "PROCESSING",
            extracted: { salonSlug: salon.slug, phone: userPhone } as never,
          },
        });
        recordId = vc.id;
      }
      const record = await prisma.voiceCall.findUnique({ where: { id: recordId } });
      const prev = (record?.extracted ?? {}) as Record<string, unknown>;

      await prisma.voiceCall.update({
        where: { id: recordId },
        data: {
          audioUrl: stored?.url ?? record?.audioUrl ?? null,
          transcript: record?.transcript
            ? `${record.transcript}\n[پاسخ تکمیلی ${field}]: ${transcript}`
            : transcript,
          extracted: { ...prev, ...(value ? { [field]: value } : {}), provider } as never,
          status: "DONE",
        },
      });

      return json({
        success: true,
        voiceCallId: recordId,
        transcript,
        provider,
        field,
        fieldValue: value ?? null,
        extracted,
        ...resolveCatalog(extracted, transcript, services, staff),
        salon: { id: salon.id, name: salon.name, slug: salon.slug },
      });
    }

    // ── حالت عادی: استخراج کامل نوبت ──
    const voiceCall = await prisma.voiceCall.create({
      data: {
        salonId,
        audioUrl: stored?.url ?? null,
        durationSec: audio ? Math.round(audio.size / 8000) : null,
        status: "PROCESSING",
        rawText: audio ? null : typedText,
        extracted: { salonSlug: salon.slug, phone: userPhone } as never,
      },
    });

    // اگر این برش ادامهٔ یک گفتگوی نیمه‌تمام باشد (متن/فایل بعد از ضبط‌های قبلی)،
    // مقادیر تازه فقط فیلدهای پرشده را جایگزین نتیجهٔ پیشین می‌کنند.
    let prior: Partial<ExtractedAppointment> = {};
    try {
      prior = partialRaw ? (JSON.parse(partialRaw) as Partial<ExtractedAppointment>) : {};
    } catch {
      prior = {};
    }

    const fresh = await extractAppointment(transcript, {
      timezone: salon.timezone,
      serviceNames,
      staffNames,
      customerName: prior.name,
    });
    const extracted = mergeExtracted(prior, fresh);
    // «آرایشگر فرقی نمی‌کند» در برش تازه، ترجیحِ برش قبلی را هم پاک می‌کند
    if (isAnyStaffPhrase(transcript)) delete extracted.staff;

    await prisma.voiceCall.update({
      where: { id: voiceCall.id },
      data: {
        transcript,
        extracted: { ...extracted, provider } as never,
        status: "DONE",
      },
    });

    return json({
      success: true,
      voiceCallId: voiceCall.id,
      transcript,
      provider,
      extracted,
      ...resolveCatalog(extracted, transcript, services, staff),
      salon: { id: salon.id, name: salon.name, slug: salon.slug },
    });
  } catch (err) {
    return apiError(err);
  }
}
