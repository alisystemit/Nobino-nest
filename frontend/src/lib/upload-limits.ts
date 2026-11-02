/**
 * سقف‌های پویای بارگذاری فایل — خوانده‌شده از سوپرادمین.
 *
 * مقدارها در پنل سوپرادمین (تنظیمات سیستم > «بارگذاری فایل» و «پروندهٔ مشتریان»)
 * تغییر می‌کنند و از endpoint عمومی `/api/public/upload-limits` می‌آیند. نتیجه در
 * حافظه نگه داشته می‌شود (تا سرعتی‌ترین فراخوان بعد از تغییر، مقدار تازه می‌گیرد)
 * و در صورت خطا پیش‌فرض‌های هم‌نام با کد بک‌اند برگردانده می‌شوند تا هیچ‌وقت
 * آپلود به‌خاطر یک پاسخ ناموفق قفل نشود.
 */

export type UploadLimits = {
  /** حداکثر حجم آواتار (مگابایت) */
  avatarMaxMb: number;
  /** حداکثر حجم تصویر سالن — لوگو/بنر/گالری (مگابایت) */
  imageMaxMb: number;
  /** حداکثر حجم ویس رزرو هوشمند (مگابایت) */
  voiceMaxMb: number;
  /** سقف‌های پروندهٔ مشتری (CRM) */
  crm: {
    noteLimit: number;
    mediaLimit: number;
    photoMaxMb: number;
    voiceMaxMb: number;
    mediaEnabled: boolean;
  };
};

export const UPLOAD_LIMIT_FALLBACK: UploadLimits = {
  avatarMaxMb: 3,
  imageMaxMb: 5,
  voiceMaxMb: 3,
  crm: { noteLimit: 5, mediaLimit: 10, photoMaxMb: 5, voiceMaxMb: 10, mediaEnabled: true },
};

const REVALIDATE_MS = 60_000; // بعد از هر دقیقه، فراخوان بعدی مقدار تازه می‌گیرد
const CACHE_KEY = "nobino.uploadLimits.v1";

let memory: { value: UploadLimits; at: number } | null = null;

function isValidShape(raw: any): raw is UploadLimits {
  return (
    raw &&
    Number.isFinite(Number(raw.avatarMaxMb)) &&
    Number.isFinite(Number(raw.imageMaxMb)) &&
    Number.isFinite(Number(raw.voiceMaxMb))
  );
}

function fromStorage(): UploadLimits | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidShape(parsed?.value)) return null;
    memory = { value: parsed.value as UploadLimits, at: Number(parsed.at) || 0 };
    return memory.value;
  } catch {
    return null;
  }
}

function toStorage(value: UploadLimits) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ value, at: Date.now() }));
  } catch {
    /* حالت خصوصی/پر بودن حافظه — فقط کش حافظه‌ای می‌ماند */
  }
}

/**
 * بدون await: آخرین مقدار شناخته‌شده یا پیش‌فرض. برای متن راهنما کافی است؛
 * بررسی نهایی حجم همیشه سمت سرور انجام می‌شود.
 */
export function uploadLimitsSync(): UploadLimits {
  if (memory) return memory.value;
  const cached = fromStorage();
  return cached ?? UPLOAD_LIMIT_FALLBACK;
}

/** مقدار تازه (حداکثر یک بار در دقیقه fetch واقعی می‌شود). */
export async function getUploadLimits(): Promise<UploadLimits> {
  if (memory && Date.now() - memory.at < REVALIDATE_MS) return memory.value;
  const cached = fromStorage();
  const fresh = cached && Date.now() - (memory?.at ?? 0) < REVALIDATE_MS;
  if (fresh && cached) return cached;
  try {
    const res = await fetch("/api/public/upload-limits", { credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok || data?.success !== false) {
      const value: UploadLimits = {
        avatarMaxMb: Number(data.avatarMaxMb) || UPLOAD_LIMIT_FALLBACK.avatarMaxMb,
        imageMaxMb: Number(data.imageMaxMb) || UPLOAD_LIMIT_FALLBACK.imageMaxMb,
        voiceMaxMb: Number(data.voiceMaxMb) || UPLOAD_LIMIT_FALLBACK.voiceMaxMb,
        crm: { ...UPLOAD_LIMIT_FALLBACK.crm, ...(data.crm ?? {}) },
      };
      memory = { value, at: Date.now() };
      toStorage(value);
      return value;
    }
  } catch {
    /* شبکه/سرور در دسترس نیست — آخرین مقدار یا پیش‌فرض */
  }
  return cached ?? UPLOAD_LIMIT_FALLBACK;
}

/** پیام فارسی «کمتر از N مگابایت» — با ارقام فارسی */
export function sizeHintFa(mb: number): string {
  const fa = String(mb).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  return `باید کمتر از ${fa} مگابایت باشد`;
}

/** تبدیل مگابایت به بایت */
export const mbToBytes = (mb: number) => mb * 1024 * 1024;
