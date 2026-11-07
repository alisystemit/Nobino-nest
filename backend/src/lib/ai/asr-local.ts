import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getSetting } from "@/lib/settings";

/**
 * تبدیل گفتار فارسی به متن با مدل محلی «شنوا کوچیک» (Shenava-Koochik 114M).
 *
 * چرا sherpa-onnx و نه NeMo؟
 *   NeMo فقط پایتونی است و به سرویس جانبی + PyTorch (~۲ گیگ RAM) نیاز دارد؛ اما
 *   همان مدل به‌صورت ONNX (FP32 CTC) برای sherpa-onnx منتشر شده و پکیج npm
 *   `sherpa-onnx-node` باینری پیش‌ساختهٔ ویندوز/لینوکس/مک دارد. پس مدل مستقیم
 *   داخل همین پروسهٔ NestJS اجرا می‌شود: بدون پایتون، بدون کانتینر اضافه.
 *
 * پیش‌نیاز فایل‌ها (با `npm run asr:model` دانلود می‌شوند):
 *   models/shenava-koochik-v1.0-sherpa-onnx/model.onnx   (~۴۵۹ مگابایت)
 *   models/shenava-koochik-v1.0-sherpa-onnx/tokens.txt
 *
 * ورودی هر فرمتی که ffmpeg بشناسد (webm/ogg/mp4/mp3/wav) است؛ به PCM مونو
 * ۱۶ کیلوهرتز تبدیل و به مدل داده می‌شود. مدل offline است (نه streaming).
 *
 * منابع تقریبی: ~۱ گیگ RAM (وزن‌های FP32)، ۱–۲ vCPU؛ GPU لازم ندارد.
 *
 * ⚠️ هشدار کارت مدل: نرمال‌سازی per-feature را دستی فعال نکنید؛ متادیتای این
 * اکسپورت عمداً `normalize_type` را خالی گذاشته و sherpa-onnx همین رفتار را
 * درست اعمال می‌کند. در این ماژول هیچ override ای برایش نمی‌گذاریم.
 */

const MODEL_DIR_NAME = "shenava-koochik-v1.0-sherpa-onnx";
const MODEL_FILE = "model.onnx";
const TOKENS_FILE = "tokens.txt";
const SAMPLE_RATE = 16_000;
const FEATURE_DIM = 80;
const DEFAULT_THREADS = 1;
const FFMPEG_TIMEOUT_MS = 60_000;

/** حداقل تایپ‌های لازم از sherpa-onnx-node (پکیج فایل .d.ts ندارد). */
type SherpaStream = {
  acceptWaveform: (opts: { sampleRate: number; samples: Float32Array }) => void;
};
type SherpaRecognizer = {
  createStream: () => SherpaStream;
  decode: (stream: SherpaStream) => void;
  getResult: (stream: SherpaStream) => { text?: string };
};
type SherpaModule = {
  OfflineRecognizer: new (config: Record<string, unknown>) => SherpaRecognizer;
};

/** ریشهٔ مخزن وقتی کد از `backend/dist/lib/ai` اجرا شود. */
function moduleRepoRoot(): string {
  // dist/lib/ai → dist/lib → dist → backend → ریشه
  return path.resolve(__dirname, "../../../..");
}

/** مسیرهای ممکنی که پوشهٔ models ممکن است زیرشان باشد (dev و داکر). */
function modelBases(): string[] {
  return [...new Set([process.cwd(), path.resolve(process.cwd(), ".."), moduleRepoRoot()])];
}

/**
 * پوشهٔ مدل: اول تنظیمات/محیط، بعد جست‌وجوی models/ از مسیرهای متعارف.
 * مسیر نسبی نسبت به ریشهٔ مخزن (یا cwd) تفسیر می‌شود.
 */
export function resolveModelDir(configured?: string): string {
  const raw = (configured ?? "").trim() || (process.env.SHENAVA_MODEL_DIR ?? "").trim();
  if (raw) {
    if (path.isAbsolute(raw)) return raw;
    for (const base of modelBases()) {
      const candidate = path.resolve(base, raw);
      if (existsSync(candidate)) return candidate;
    }
    return path.resolve(moduleRepoRoot(), raw);
  }
  for (const base of modelBases()) {
    const candidate = path.join(base, "models", MODEL_DIR_NAME);
    if (existsSync(candidate)) return candidate;
  }
  return path.join(moduleRepoRoot(), "models", MODEL_DIR_NAME);
}

function modelDirFromSettings(): Promise<string> {
  return getSetting("stt.local.model_dir").then(resolveModelDir);
}

function readThreads(raw?: string): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 && n <= 16 ? n : DEFAULT_THREADS;
}

/** ffmpeg: تنظیمات/محیط → models/.bin (نصب خودکار) → ffmpeg-static → PATH */
function resolveFfmpeg(configured?: string): string {
  const explicit = (configured ?? "").trim() || (process.env.FFMPEG_PATH ?? "").trim();
  if (explicit) return explicit;
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  for (const base of modelBases()) {
    const candidate = path.join(base, "models", ".bin", exe);
    if (existsSync(candidate)) return candidate;
  }
  try {
    // پکیج اختیاری است؛ اگر نصب نشده باشد به PATH برمی‌گردیم.
    const bundled = require("ffmpeg-static") as unknown;
    if (typeof bundled === "string" && bundled) return bundled;
  } catch {
    /* نصب نشده — عادی است */
  }
  return "ffmpeg";
}

/** آیا موتور محلی آماده است؟ برای isAvailable و پنل وضعیت. */
export async function localAsrStatus(): Promise<{ ok: boolean; reason?: string; modelDir: string }> {
  const modelDir = await modelDirFromSettings();
  const missing = [MODEL_FILE, TOKENS_FILE].filter((f) => !existsSync(path.join(modelDir, f)));
  if (missing.length) {
    return {
      ok: false,
      modelDir,
      reason: `مدل محلی پیدا نشد (${missing.join(", ")}) در ${modelDir} — «npm run asr:model» را اجرا کنید`,
    };
  }
  try {
    require.resolve("sherpa-onnx-node");
  } catch {
    return { ok: false, modelDir, reason: "پکیج sherpa-onnx-node نصب نیست (npm install در backend)" };
  }
  return { ok: true, modelDir };
}

let cached: { key: string; rec: SherpaRecognizer } | null = null;
let pending: { key: string; p: Promise<SherpaRecognizer> } | null = null;

/** ساخت (و کش کردن) recognizer — گران است و باید یک‌بار در عمر پروسه ساخته شود. */
async function getRecognizer(modelDir: string, numThreads: number): Promise<SherpaRecognizer> {
  const key = `${modelDir}|${numThreads}`;
  if (cached?.key === key) return cached.rec;
  if (pending?.key === key) return pending.p;

  const p = (async () => {
    const sherpa = require("sherpa-onnx-node") as SherpaModule;
    const rec = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: FEATURE_DIM },
      modelConfig: {
        nemoCtc: { model: path.join(modelDir, MODEL_FILE) },
        tokens: path.join(modelDir, TOKENS_FILE),
        numThreads,
        provider: "cpu",
        debug: 0,
      },
    });
    cached = { key, rec };
    return rec;
  })().finally(() => {
    if (pending?.key === key) pending = null;
  });

  pending = { key, p };
  return p;
}

/** فایل صوتی هر فرمتی → Float32Array مونو ۱۶kHz با ffmpeg (خروجی خام f32le). */
function decodeToPcm(audio: Uint8Array, ffmpeg: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "1",
        "-ar",
        String(SAMPLE_RATE),
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", "pipe"] }
    );

    const chunks: Buffer[] = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("تبدیل صدا با ffmpeg بیش از حد طول کشید"));
    }, FFMPEG_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      const hint =
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? " — ffmpeg پیدا نشد؛ FFMPEG_PATH را تنظیم کنید یا ffmpeg را نصب کنید"
          : "";
      reject(new Error(`${err.message}${hint}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffmpeg با کد ${code} خارج شد: ${stderr.trim().slice(0, 300)}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 4) {
        reject(new Error("صدای استخراج‌شده خالی است"));
        return;
      }
      // بافر ممکن است طولی غیرمضرب ۴ داشته باشد؛ بخش ناقص آخر دور ریخته می‌شود.
      const samples = new Float32Array(Math.floor(buf.length / 4));
      for (let i = 0; i < samples.length; i++) samples[i] = buf.readFloatLE(i * 4);
      resolve(samples);
    });

    // اگر ffmpeg پیش از نوشتن کامل stdin ببندد، EPIPE نباید پروسه را بیندازد.
    child.stdin.on("error", () => undefined);
    child.stdin.end(Buffer.from(audio));
  });
}

export type LocalAsrOptions = {
  /** مسیر ffmpeg؛ خالی = خودکار */
  ffmpeg?: string;
  /** تعداد تردهای CPU؛ خالی = ۱ (برای سیستم‌های ۴ تردی مثل i5-6200U) */
  numThreads?: number;
};

/**
 * تبدیل گفتار به متن با مدل محلی. در نبود مدل/ffmpeg خطا پرتاب می‌کند تا
 * زنجیرهٔ fallback در stt.ts به ربات بعدی برود.
 */
export async function transcribeLocal(audio: Uint8Array, opts?: LocalAsrOptions): Promise<string> {
  const status = await localAsrStatus();
  if (!status.ok) throw new Error(status.reason ?? "مدل محلی در دسترس نیست");

  const numThreads =
    opts?.numThreads ?? readThreads(await getSetting("stt.local.num_threads"));
  const ffmpeg = resolveFfmpeg(opts?.ffmpeg ?? (await getSetting("stt.local.ffmpeg")));

  const [recognizer, samples] = await Promise.all([
    getRecognizer(status.modelDir, numThreads),
    decodeToPcm(audio, ffmpeg),
  ]);

  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples });
  recognizer.decode(stream);
  return (recognizer.getResult(stream).text ?? "").trim();
}

/** فقط برای تست‌ها: آزادسازی مدل کش‌شده. */
export function resetLocalAsrCache(): void {
  cached = null;
  pending = null;
}
