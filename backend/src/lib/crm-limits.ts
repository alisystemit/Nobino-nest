import { getSetting } from "@/lib/settings";

/**
 * سقف‌های پروندهٔ مشتری (CRM) — یادداشت، عکس و ویس.
 *
 * قبلاً این عدد‌ها داخل route ها hard-code بودند (`MAX_NOTES = 5` و `MAX_MEDIA = 10`)
 * و سوپرادمین هیچ راهی برای تغییرشان نداشت. حالا همه از جدول `Setting` خوانده می‌شوند؛
 * کلیدها در کاتالوگ تنظیمات (`@/lib/settings-catalog`) اعلام شده‌اند و در پنل
 * سوپرادمین > تنظیمات سیستم > «پروندهٔ مشتریان» قابل ویرایش‌اند.
 *
 * اولویت: مقدار پنل ← پیش‌فرض همین فایل. مقادیر نامعتبر (خالی، حروف، صفر، منفی)
 * نادیده گرفته می‌شوند تا یک اشتباه تایپی نتواند پرونده‌ها را قفل کند.
 */

export type CrmLimits = {
  /** حداکثر تعداد یادداشت برای هر مشتری */
  noteLimit: number;
  /** حداکثر تعداد فایل (عکس + ویس) برای هر مشتری */
  mediaLimit: number;
  /** حداکثر حجم هر عکس (بایت) */
  photoMaxBytes: number;
  /** حداکثر حجم هر ویس (بایت) */
  voiceMaxBytes: number;
  /** آیا اصلاً اجازهٔ بارگذاری عکس/ویس هست؟ */
  mediaEnabled: boolean;
};

/** پیش‌فرض‌ها — همان رفتار نسخهٔ قبلی */
export const CRM_DEFAULTS = {
  noteLimit: 5,
  mediaLimit: 10,
  photoMaxMb: 5,
  voiceMaxMb: 10,
} as const;

/** دامنهٔ معقول برای هر کلید (جلوگیری از ۰، منفی یا عدد نجومی) */
const RANGE = {
  "crm.note_limit": { min: 1, max: 200 },
  "crm.media_limit": { min: 1, max: 500 },
  "crm.photo_max_mb": { min: 1, max: 50 },
  "crm.voice_max_mb": { min: 1, max: 50 },
} as const;

async function intSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  const text = String(raw ?? "").trim();
  if (text === "") return fallback;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return fallback;
  const range = RANGE[key as keyof typeof RANGE];
  return Math.min(range.max, Math.max(range.min, Math.floor(parsed)));
}

export async function crmLimits(): Promise<CrmLimits> {
  const [noteLimit, mediaLimit, photoMaxMb, voiceMaxMb, mediaRaw] = await Promise.all([
    intSetting("crm.note_limit", CRM_DEFAULTS.noteLimit),
    intSetting("crm.media_limit", CRM_DEFAULTS.mediaLimit),
    intSetting("crm.photo_max_mb", CRM_DEFAULTS.photoMaxMb),
    intSetting("crm.voice_max_mb", CRM_DEFAULTS.voiceMaxMb),
    getSetting("crm.media_enabled"),
  ]);
  // خالی/ست‌نشده = فعال (سازگار با گذشته)؛ فقط "false" صریح آن را خاموش می‌کند
  const mediaEnabled = String(mediaRaw ?? "").trim() !== "false";
  return {
    noteLimit,
    mediaLimit,
    photoMaxBytes: photoMaxMb * 1024 * 1024,
    voiceMaxBytes: voiceMaxMb * 1024 * 1024,
    mediaEnabled,
  };
}

/** نسخهٔ قابل‌نمایش برای پاسخ API (مگابایت به‌جای بایت) */
export function crmLimitsPayload(l: CrmLimits) {
  return {
    noteLimit: l.noteLimit,
    mediaLimit: l.mediaLimit,
    photoMaxMb: Math.round(l.photoMaxBytes / (1024 * 1024)),
    voiceMaxMb: Math.round(l.voiceMaxBytes / (1024 * 1024)),
    mediaEnabled: l.mediaEnabled,
  };
}
