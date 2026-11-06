/**
 * سقف حجم بدنهٔ درخواست.
 *
 * چرا لازم است؟ بدنه‌پارسر خاموش است و `run-route` جریان درخواست را مستقیم به
 * `Request` می‌دهد؛ بدون سقف، یک درخواست با بدنهٔ چند گیگابایتی (یا chunked
 * بی‌پایان) می‌تواند حافظه/دیسک/پهنای باند را ببلعد حتی پیش از احراز هویت.
 *
 * دو سطح دفاع:
 *  ۱) `Content-Length` اعلامی بیشتر از سقف ⇒ همان ابتدا ۴۱۳ (بدون خواندن بدنه).
 *  ۲) استریم شمارنده: اگر کلاینت Content-Length نگوید (chunked) و از سقف بگذرد،
 *     استریم با خطای ۴۱۳ قطع می‌شود.
 *
 * مسیرهای آپلود سقف جداگانه دارند (پیش‌فرض ۱۱۰ مگابایت = بیشترین مقدار مجاز
 * تنظیمات پنل ۱۰۰ مگابایت + سربار multipart).
 */
import { Transform } from "node:stream";
import type { IncomingMessage } from "node:http";

function bytesFromEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** سقف بدنهٔ JSON/فرم‌های معمولی */
export function jsonBodyLimit(): number {
  return bytesFromEnv("MAX_JSON_BODY_BYTES", 2 * 1024 * 1024);
}

/** سقف بدنهٔ مسیرهای آپلود فایل */
export function uploadBodyLimit(): number {
  return bytesFromEnv("MAX_UPLOAD_BODY_BYTES", 110 * 1024 * 1024);
}

/** مسیرهایی که بدنهٔ multipart/فایل می‌گیرند */
const UPLOAD_PATTERNS: RegExp[] = [
  /^\/api\/upload\/[^/]+\/?$/,
  /^\/api\/voice\/transcribe\/?$/,
  /^\/api\/dashboard\/salons\/[^/]+\/images\/?$/,
  /^\/api\/dashboard\/salons\/[^/]+\/customers\/[^/]+\/media\/?$/,
];

export function bodyLimitForPath(pathname: string): number {
  return UPLOAD_PATTERNS.some((re) => re.test(pathname)) ? uploadBodyLimit() : jsonBodyLimit();
}

export class BodyTooLargeError extends Error {
  readonly status = 413;
  constructor(limit: number) {
    super(bodyLimitMessage(limit));
    this.name = "BodyTooLargeError";
  }
}

/** پیام فارسی سقف بدنه */
export function bodyLimitMessage(limit: number): string {
  const size =
    limit >= 1024 * 1024
      ? `${Math.round(limit / 1024 / 1024)} مگابایت`
      : `${Math.max(1, Math.round(limit / 1024))} کیلوبایت`;
  return `حجم بدنهٔ درخواست بیش از سقف مجاز (${size}) است`;
}

/** آستانهٔ خطای ۴۱۳ بر اساس Content-Length اعلامی (۰ = مجاز) */
export function declaredBodyExceeds(headerValue: string | undefined, limit: number): boolean {
  const declared = Number(String(headerValue ?? "").trim());
  return Number.isFinite(declared) && declared > limit;
}

/**
 * بدنهٔ درخواست را با شمارنده به یک Transform تبدیل می‌کند.
 * `tooLarge` بعد از خطا (یا اتمام) می‌گوید آیا از سقف گذشته است.
 */
export function limitedBodyStream(
  req: IncomingMessage,
  limit: number,
): { stream: Transform; tooLarge: () => boolean } {
  let total = 0;
  let exceeded = false;

  const stream = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      if (total > limit) {
        exceeded = true;
        req.unpipe(stream);
        // بقیهٔ بدنه دور ریخته شود (بدون انباشتن در حافظه) تا پاسخ ۴۱۳ بتواند نوشته شود
        req.resume();
        callback(new BodyTooLargeError(limit));
        return;
      }
      callback(null, chunk);
    },
  });

  req.on("error", (err) => stream.destroy(err));
  req.pipe(stream);

  return { stream, tooLarge: () => exceeded };
}
