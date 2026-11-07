// بررسی سلامت موتور ASR محلی (Shenava/sherpa-onnx) بدون بالا آوردن کل اپ.
//
// استفاده:
//   npm run asr:check
//   npm run asr:check -- --wav path/to/16k-mono.wav   # تست واقعی روی یک فایل
//
// خروجی: وضعیت مدل، پکیج sherpa-onnx-node، ffmpeg و (اختیاری) متن تشخیص‌داده‌شده.
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL_DIR_NAME = "shenava-koochik-v1.0-sherpa-onnx";
const FILES = ["model.onnx", "tokens.txt"];
const args = process.argv.slice(2);
const wavArg = args.includes("--wav") ? args[args.indexOf("--wav") + 1] : "";

const ok = (v) => (v ? "✓" : "✗");
const human = (b) =>
  b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;

function resolveModelDir() {
  const raw = (process.env.SHENAVA_MODEL_DIR ?? "").trim();
  if (raw) return isAbsolute(raw) ? raw : resolve(ROOT, raw);
  return join(ROOT, "models", MODEL_DIR_NAME);
}

const problems = [];
let modelDir = "";
try {
  const settings = createRequire(join(ROOT, "backend", "package.json"));
  // تنظیمات پنل را بدون دیتابیس نمی‌خوانیم؛ همین‌جا فقط env/پیش‌فرض.
  const sherpaPath = settings.resolve("sherpa-onnx-node");
  console.log(`sherpa-onnx-node: ✓ ${sherpaPath}`);
} catch {
  console.log("sherpa-onnx-node: ✗ نصب نیست — «cd backend && npm install»");
  problems.push("sherpa-onnx-node");
}

modelDir = resolveModelDir();
console.log(`پوشهٔ مدل: ${modelDir}`);
for (const f of FILES) {
  const p = join(modelDir, f);
  if (existsSync(p) && statSync(p).size > 0) {
    console.log(`  ${ok(true)} ${f} — ${human(statSync(p).size)}`);
  } else {
    console.log(`  ${ok(false)} ${f} پیدا نشد`);
    problems.push(f);
  }
}

const localFfmpeg = join(ROOT, "models", ".bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
const ffmpeg = (process.env.FFMPEG_PATH ?? "").trim() || (existsSync(localFfmpeg) ? localFfmpeg : "ffmpeg");
const ff = spawnSync(ffmpeg, ["-version"], { encoding: "utf8" });
if (ff.status === 0) {
  console.log(`ffmpeg: ✓ ${(ff.stdout ?? "").split("\n")[0].slice(0, 80)}`);
} else if (wavArg) {
  // تست با WAV به ffmpeg نیاز ندارد؛ فقط ورودی webm/mp4 در اپ به آن نیاز دارد.
  console.log(`ffmpeg: ! پیدا نشد — برای تست WAV لازم نیست، ولی آپلود webm بدون آن کار نمی‌کند`);
} else {
  console.log(`ffmpeg: ✗ پیدا نشد (${ffmpeg}) — نصب کنید یا FFMPEG_PATH را ست کنید`);
  problems.push("ffmpeg");
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} مورد ناقص است. راهنما: docs/asr-local.md`);
  process.exit(1);
}

if (!wavArg) {
  console.log("\n✓ همه پیش‌نیازها آماده‌اند. برای تست واقعی: npm run asr:check -- --wav test.wav");
  process.exit(0);
}

const wavPath = isAbsolute(wavArg) ? wavArg : resolve(ROOT, wavArg);
if (!existsSync(wavPath)) {
  console.error(`\n✗ فایل صوتی پیدا نشد: ${wavPath}`);
  process.exit(1);
}

const req = createRequire(join(ROOT, "backend", "package.json"));
const sherpa = req("sherpa-onnx-node");
const recognizer = new sherpa.OfflineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    nemoCtc: { model: join(modelDir, "model.onnx") },
    tokens: join(modelDir, "tokens.txt"),
    numThreads: 2,
    provider: "cpu",
    debug: 0,
  },
});

const wave = sherpa.readWave(wavPath);
const stream = recognizer.createStream();
stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
const started = Date.now();
recognizer.decode(stream);
const elapsed = (Date.now() - started) / 1000;
const duration = wave.samples.length / wave.sampleRate;
const text = recognizer.getResult(stream).text ?? "";

console.log(`\nمدت صوت: ${duration.toFixed(2)}s — زمان پردازش: ${elapsed.toFixed(2)}s — RTF: ${(elapsed / duration).toFixed(3)}`);
console.log(`RAM پروسه (RSS): ${human(process.memoryUsage().rss)}`);
console.log(`متن: ${text || "(خالی)"}`);
