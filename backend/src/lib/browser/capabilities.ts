/**
 * تشخیص توانایی مرورگر برای ضبط صدا و کپی متن.
 *
 * نکتهٔ مهم: مرورگرها `navigator.mediaDevices` و `navigator.clipboard` را روی بستر
 * ناامن (http با IP یا پورت، بدون TLS) اصلاً تعریف نمی‌کنند. پیش از این، کد مستقیم
 * `navigator.mediaDevices.getUserMedia(...)` صدا می‌زد و روی `http://…:8080` یک
 * TypeError همگام بی‌رونش (بدون `catch`) تولید می‌شد؛ یعنی دکمه میکروفون هیچ
 * واکنشی نشان نمی‌داد. این ماژول همان تشخیص را به یک تابع ناپیوران و قابل تست
 * تبدیل می‌کند تا رابط کاربری بتواند دلیل فارسی + راه‌جایگزین نشان دهد.
 */

export type MicCapability = {
  /** آیا صفحه در بستر امن است (https یا localhost) */
  secureContext: boolean;
  /** آیا `navigator.mediaDevices.getUserMedia` در دسترس است */
  hasMediaDevices: boolean;
  /** آیا سازندهٔ `MediaRecorder` وجود دارد */
  hasMediaRecorder: boolean;
};

/** چیزی که از `window`/`navigator` می‌خوانیم — برای تست با آبجکت ساختگی تزریق می‌شود */
export type MicGlobals = {
  isSecureContext?: boolean;
  mediaDevices?: { getUserMedia?: unknown } | null;
  MediaRecorder?: unknown;
};

export function readMicCapability(g: MicGlobals): MicCapability {
  return {
    secureContext: Boolean(g.isSecureContext),
    hasMediaDevices: Boolean(g.mediaDevices && typeof g.mediaDevices.getUserMedia === "function"),
    hasMediaRecorder: Boolean(g.MediaRecorder),
  };
}

/** دلیل فارسیِ نبود امکان ضبط؛ `null` یعنی همه‌چیز برای میکروفون آماده است */
export function micBlockReason(cap: MicCapability): string | null {
  if (!cap.secureContext) {
    return "مرورگر فقط روی آدرس امن (https) به میکروفون اجازه می‌دهد. آدرس فعلی http است، پس ضبط صدا قفل می‌شود.";
  }
  if (!cap.hasMediaDevices) {
    return "این مرورگر امکان دسترسی به میکروفون (mediaDevices) را ندارد. از Chrome یا Firefox به‌روز استفاده کنید.";
  }
  if (!cap.hasMediaRecorder) {
    return "مرورگر ابزار ضبط صوت (MediaRecorder) را ندارد. می‌توانید فایل صوتی آماده را از بخش «آپلود فایل صوتی» بفرستید.";
  }
  return null;
}

/** آیا باید به راه‌جایگزین (آپلود فایل / تایپ متن) هدایت کنیم */
export function micUnavailable(cap: MicCapability): boolean {
  return micBlockReason(cap) !== null;
}

/** راهنمای کوتاه فعال‌کردن https برای همین سرور (نسخهٔ قابل استفاده در متن UI) */
export const HTTPS_HINT =
  "برای فعال‌شدن میکروفون و نصب اپ، آدرس سالن را با https باز کنید (نصب گواهی TLS روی همان Apache در مستندات آمده است).";

/** آیا `navigator.clipboard.writeText` موجود است؛ روی http خالی/تعریف‌نشده است */
export function clipboardAvailable(clipboard: { writeText?: unknown } | null | undefined): boolean {
  return Boolean(clipboard && typeof clipboard.writeText === "function");
}
