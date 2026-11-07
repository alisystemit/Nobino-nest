#!/usr/bin/env node
// آماده‌سازی خودکار دارایی‌های ASR محلی — معمولاً از بوت (paas-start) یا
// «npm run dev» صدا زده می‌شود و نیازی به اجرای دستی نیست.
//
// اجرای دستی (اختیاری):
//   npm run asr:setup
//   npm run asr:setup -- --force
//   AUTO_ASR=0 npm run dev        # خاموش کردن دانلود خودکار
//   AUTO_ASR_FFMPEG=0 ...         # فقط مدل، بدون دانلود ffmpeg
//
// اگر دانلود قطع شود، فایل .part می‌ماند و اجرای بعدی ادامه می‌دهد.
import { appendFileSync, existsSync } from "node:fs";
import { resolve, dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, ensureAsrModel, ensureFfmpeg, human, modelDirOf } from "./lib/asr-assets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// متغیرهای .env را هم ببین (بدون بازنویسی مقادیر محیطی موجود). ترتیب مهم است:
// اول .env.production تا مقادیر .env آن را بازنویسی نکنند.
for (const file of [".env.production", ".env"]) {
  const p = join(ROOT, file);
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch {
      /* نسخهٔ قدیمی Node یا فایل نامعتبر — نادیده */
    }
  }
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const envOn = (name, fallback = true) => {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "no", "off"].includes(raw);
};

const logFileIdx = argv.indexOf("--log");
const logFile = logFileIdx >= 0 ? argv[logFileIdx + 1] : "";
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg) => {
  const line = `[asr ${stamp()}] ${msg}`;
  if (logFile) {
    try {
      appendFileSync(logFile, line + "\n");
      return;
    } catch {
      /* به کنسول برگرد */
    }
  }
  console.log(line);
};

async function main() {
  if (has("--help")) {
    console.log("اجرا: node scripts/asr-setup.mjs [--force] [--skip-model] [--skip-ffmpeg] [--log FILE]");
    return;
  }

  const force = has("--force");
  const wantModel = !has("--skip-model") && envOn("AUTO_ASR", true) && envOn("AUTO_ASR_MODEL", true);
  const wantFfmpeg = !has("--skip-ffmpeg") && envOn("AUTO_ASR", true) && envOn("AUTO_ASR_FFMPEG", true);
  if (!wantModel && !wantFfmpeg) {
    log("دانلود خودکار خاموش است (AUTO_ASR/AUTO_ASR_MODEL/AUTO_ASR_FFMPEG)");
    return;
  }

  const release = acquireLock(ROOT);
  if (!release) {
    log("پروسهٔ دیگری در حال آماده‌سازی است — رد شد");
    return;
  }

  try {
    const modelDirRaw = (process.env.SHENAVA_MODEL_DIR ?? "").trim();
    const modelDir = modelDirRaw
      ? isAbsolute(modelDirRaw)
        ? modelDirRaw
        : resolve(ROOT, modelDirRaw)
      : modelDirOf(ROOT);

    if (wantModel) {
      log(`بررسی مدل در ${modelDir}`);
      const dir = await ensureAsrModel({ root: ROOT, modelDir, force, log });
      log(`مدل آماده است: ${dir}`);
    }
    if (wantFfmpeg) {
      const bin = await ensureFfmpeg({ root: ROOT, force, log });
      log(bin ? `ffmpeg آماده است: ${bin}` : "ffmpeg خودکار آماده نشد — مدل فقط با WAV کار می‌کند");
    }
    log(`پایان (RAM تقریبی هنگام اجرا: ~${human(320 * 1024 * 1024)}) — مدل با 1 ترد و فشرده‌سازی FP16`);
  } finally {
    release();
  }
}

main().catch((err) => {
  log(`✗ آماده‌سازی ناموفق: ${err.message}`);
  process.exitCode = 1;
});
