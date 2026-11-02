import { getSetting } from "@/lib/settings";

/**
 * سقف‌های سراسری بارگذاری فایل — آواتار، تصویر سالن (لوگو/بنر/گالری) و ویس تبدیل گفتار.
 *
 * الگوی دقیقاً همان `crm-limits.ts` (بخش «پروندهٔ مشتریان») که قبلاً فقط برای
 * عکس/ویسِ پرونده پویا بود؛ حالا بقیهٔ نقاط آپلود هم از جدول `Setting` می‌خوانند
 * و سوپرادمین در پنل > تنظیمات سیستم > «بارگذاری فایل» بدون ری‌استارت تغییرشان می‌دهد.
 *
 * اولویت: مقدار پنل ← پیش‌فرض همین فایل. مقادیر نامعتبر (خالی، حروف، صفر، منفی،
 * نجومی) نادیده گرفته می‌شوند تا یک اشتباه تایپی آپلودها را قفل نکند.
 * برای سازگاری با مستقرسازی قدیمی، کلید بایتی `voice.max_upload_bytes` (متغیر
 * محیطی VOICE_MAX_UPLOAD_BYTES) اگر ست شده باشد بر `upload.voice_max_mb` مقدم است.
 */

export type UploadLimits = {
  /** حداکثر حجم آواتار کاربر/کارمند (بایت) */
  avatarMaxBytes: number;
  /** حداکثر حجم تصویر سالن — لوگو، بنر، گالری (بایت) */
  imageMaxBytes: number;
  /** حداکثر حجم ویس ارسالی به سرویس تبدیل گفتار (بایت) */
  voiceMaxBytes: number;
};

export const UPLOAD_DEFAULTS = {
  avatarMaxMb: 3,
  imageMaxMb: 5,
  voiceMaxMb: 3,
} as const;

/** دامنهٔ معقول (۱ تا ۱۰۰ مگابایت) */
function clampMb(value: number): number {
  return Math.min(100, Math.max(1, Math.floor(value)));
}

async function mbSetting(key: string, fallbackMb: number): Promise<number> {
  const raw = await getSetting(key);
  const text = String(raw ?? "").trim();
  if (text === "") return fallbackMb;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMb;
  return clampMb(parsed);
}

export async function uploadLimits(): Promise<UploadLimits> {
  const [avatarMaxMb, imageMaxMb, voiceMaxMb, legacyVoiceBytes] = await Promise.all([
    mbSetting("upload.avatar_max_mb", UPLOAD_DEFAULTS.avatarMaxMb),
    mbSetting("upload.image_max_mb", UPLOAD_DEFAULTS.imageMaxMb),
    mbSetting("upload.voice_max_mb", UPLOAD_DEFAULTS.voiceMaxMb),
    getSetting("voice.max_upload_bytes"),
  ]);
  // سازگاری با گذشته: سقف بایتی قدیمیِ ویس، اگر عدد معتبری بود، بر مگابایتِ پنل مقدم است
  // (اولویت مثل نسخهٔ قبلی: تنظیم پنل ← متغیر محیطی VOICE_MAX_UPLOAD_BYTES)
  const legacy = Number(String(legacyVoiceBytes ?? process.env.VOICE_MAX_UPLOAD_BYTES ?? "").trim());
  const voiceBytes =
    Number.isFinite(legacy) && legacy > 0 ? legacy : voiceMaxMb * 1024 * 1024;
  return {
    avatarMaxBytes: avatarMaxMb * 1024 * 1024,
    imageMaxBytes: imageMaxMb * 1024 * 1024,
    voiceMaxBytes: voiceBytes,
  };
}

/** نسخهٔ قابل‌نمایش برای کلاینت (مگابایت) */
export function uploadLimitsPayload(l: UploadLimits) {
  return {
    avatarMaxMb: Math.round(l.avatarMaxBytes / (1024 * 1024)),
    imageMaxMb: Math.round(l.imageMaxBytes / (1024 * 1024)),
    voiceMaxMb: Math.round(l.voiceMaxBytes / (1024 * 1024)),
  };
}

/** پیام فارسی «کمتر از N مگابایت» — عدد با ارقام فارسی */
export function sizeLimitFa(mb: number): string {
  const fa = String(mb).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  return `حجم فایل باید کمتر از ${fa} مگابایت باشد`;
}
