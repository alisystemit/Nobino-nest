// خودکار: پورت‌شده از src/app/api/voice/transcribe/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { transcribeWithFallback, type SttProvider } from "@/lib/ai/stt";
import { extractAppointment, extractSingleField, type ExtractedAppointment, type ExtractedField } from "@/lib/ai/parser";
import { mergeExtracted } from "@/lib/ai/merge";
import { storeFile } from "@/lib/storage";
import { withinLimit } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";

const FIELDS: ExtractedField[] = ["name", "phone", "service", "date", "time"];

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

    // ذخیره فایل صوتی (Blob در پروداکشن، محلی در توسعه) — در حالت متنی فایلی نیست
    let stored: { url: string } | null = null;
    let transcript: string;
    let provider: SttProvider | "text";

    if (audio) {
      stored = await storeFile(audio, { dir: "voice" });
      const buffer = Buffer.from(await audio.arrayBuffer());
      // پردازش با زنجیره ربات‌های STT (OpenAI → Groq → Mock)
      const stt = await transcribeWithFallback(new Uint8Array(buffer), {
        filename: audio.name || "recording.webm",
        mimeType: audio.type,
      });
      transcript = stt.transcript;
      provider = stt.provider;
    } else {
      // ورودی تایپ‌شده (پشتیبانِ میکروفون روی بستر ناامن): بدون STT، فقط استخراج
      transcript = typedText;
      provider = "text";
    }

    // خدمات واقعی سالن برای تطبیق دقیق‌تر سرویس در استخراج
    const services = await prisma.service.findMany({
      where: { salonId, isActive: true },
      select: { name: true },
      orderBy: { name: "asc" },
    });
    const serviceNames = services.map((s) => s.name);

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

    const fresh = await extractAppointment(transcript, {
      timezone: salon.timezone,
      serviceNames,
    });

    // اگر این برش ادامهٔ یک گفتگوی نیمه‌تمام باشد (متن/فایل بعد از ضبط‌های قبلی)،
    // مقادیر تازه فقط فیلدهای پرشده را جایگزین نتیجهٔ پیشین می‌کنند.
    let prior: Partial<ExtractedAppointment> = {};
    try {
      prior = partialRaw ? (JSON.parse(partialRaw) as Partial<ExtractedAppointment>) : {};
    } catch {
      prior = {};
    }
    const extracted = mergeExtracted(prior, fresh);

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
      salon: { id: salon.id, name: salon.name, slug: salon.slug },
    });
  } catch (err) {
    return apiError(err);
  }
}
