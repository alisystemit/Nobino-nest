import path from "node:path";

/**
 * تشخیص واقعی نوع فایل از روی «امضای بایت» (magic bytes) — نه نام یا MIME ادعایی کلاینت.
 *
 * چرا؟ `file.type` و پسوند در FormData کاملاً در اختیار کلاینت‌اند؛ مهاجم می‌تواند
 * یک HTML/JS/SVG را با پسوند `.png` و `Content-Type: image/png` بفرستد. اگر همان
 * مسیر ذخیره و بعداً با همان Content-Type سرو شود، XSS ذخیره‌شده می‌دهد.
 *
 * فقط چند بایت اول خوانده می‌شود (`Blob.slice`) تا فایل‌های چندمگابایتی در حافظه
 * دو بار بافر نشوند.
 */

/** انواع تصویری که برنامه از آن‌ها پشتیبانی می‌کند */
export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/avif";

/** انواع صوتی مجاز برای آپلود/تبدیل گفتار */
export type AudioMime = "audio/mpeg" | "audio/wav" | "audio/ogg" | "audio/webm" | "audio/mp4" | "audio/aac";

/** پسوند امن هر MIME — منبع واحد حقیقت برای ذخیره‌سازی */
export const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "audio/mp4": ".mp4",
  "audio/m4a": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
};

/** فهرست پسوندهایی که اجازهٔ ذخیره/سرو دارند (بقیه → .bin و غیرقابل‌سرو) */
export const SAFE_EXTENSIONS = new Set(Object.values(EXT_BY_MIME));

/** نرمال‌سازی MIME: حذف پارامترها (`;codecs=opus`)، فاصله و حروف بزرگ */
export function normalizeMime(raw: string | undefined | null): string {
  return String(raw ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

/** MIME درست بر اساس پسوند — برای سرو امن فایل‌های ذخیره‌شده */
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".mp4": "audio/mp4",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

export function mimeForExtension(ext: string): string | null {
  return MIME_BY_EXT[String(ext).toLowerCase()] ?? null;
}

/** فقط چند بایت اول فایل را می‌خواند */
async function readHead(file: Blob, bytes = 64): Promise<Buffer> {
  const slice = file.slice(0, Math.min(bytes, file.size));
  return Buffer.from(await slice.arrayBuffer());
}

/** تشخیص نوع تصویر از امضای بایت */
export function sniffImageMime(buf: Buffer): ImageMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";

  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }

  const ascii = (start: number, end: number) => buf.toString("latin1", start, end);

  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  // GIF87a / GIF89a
  if (buf.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "image/gif";
  // AVIF یک کانتینر ISO-BMFF است: بایت‌های ۴..۷ برابر "ftyp" و برند در ۸..۱۱
  if (buf.length >= 12 && ascii(4, 8) === "ftyp" && (ascii(8, 12) === "avif" || ascii(8, 12) === "avis")) {
    return "image/avif";
  }

  return null;
}

/** تشخیص نوع صدا از امضای بایت (برای مسیرهای آپلود صدا) */
export function sniffAudioMime(buf: Buffer): AudioMime | null {
  const ascii = (start: number, end: number) => buf.toString("latin1", start, end);

  if (buf.length >= 4 && ascii(0, 4) === "OggS") return "audio/ogg";
  // EBML (ماتروسکا/WebM)
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "audio/webm";
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (buf.length >= 3 && ascii(0, 3) === "ID3") return "audio/mpeg";
  // کانتینر ISO-BMFF (mp4/m4a)
  if (buf.length >= 12 && ascii(4, 8) === "ftyp") return "audio/mp4";
  // ADTS (AAC) یا فریم MPEG (MP3) — هر دو با 0xFF شروع می‌شوند
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return (buf[1] & 0x06) === 0 ? "audio/aac" : "audio/mpeg";
  }
  return null;
}

/**
 * اعتبارسنجی محتوای تصویر: هم MIME ادعایی باید مجاز باشد، هم بایت‌های واقعی
 * باید یکی از انواع مجاز را نشان دهند. خروجی، MIME واقعیِ تشخیص‌داده‌شده است
 * تا پسوند فایل ذخیره‌شده از محتوا گرفته شود.
 */
export async function validateImageContent(file: File, allowed: readonly ImageMime[]): Promise<ImageMime> {
  if (!file.size) throw new Error("فایل خالی است");
  const detected = sniffImageMime(await readHead(file));
  if (!detected || !allowed.includes(detected)) throw new Error("فایل واقعاً تصویر مجاز نیست");
  return detected;
}

/** همان قرارداد برای فایل صوتی */
export async function validateAudioContent(file: File, allowed: readonly AudioMime[]): Promise<AudioMime> {
  if (!file.size) throw new Error("فایل خالی است");
  const detected = sniffAudioMime(await readHead(file));
  if (!detected || !allowed.includes(detected)) throw new Error("فایل واقعاً صوت مجاز نیست");
  return detected;
}

/**
 * نام فایل امن برای ارسال به سرویس‌های خارجی (STT) — بدون مسیر، بدون کاراکتر کنترلی.
 */
export function safeUploadName(name: string | undefined | null, fallbackMime?: string): string {
  const base = path.basename(String(name ?? "")).replace(/[^\w.\-]/g, "").slice(0, 80);
  if (base && base !== "." && base !== "..") return base;
  const ext = EXT_BY_MIME[normalizeMime(fallbackMime)] ?? "";
  return `upload${ext}`;
}
