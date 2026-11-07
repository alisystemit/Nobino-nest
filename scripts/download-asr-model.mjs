// دانلود دستی مدل محلی گفتار «شنوا کوچیک» (sherpa-onnx).
//
// معمولاً لازم نیست: بوت اپ (paas-start) و «npm run dev» خودشان مدل و ffmpeg را
// آماده می‌کنند. این فرمان برای نصب از پیش یا عیب‌یابی است.
//
//   npm run asr:model                 # دانلود/ادامهٔ دانلود
//   npm run asr:model -- --force      # از صفر
//   HF_TOKEN=... npm run asr:model    # اگر HuggingFace محدودیت نرخ داد
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, ensureAsrModel, ensureFfmpeg, human, modelDirOf, MODEL_REPO } from "./lib/asr-assets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");

async function main() {
  const release = acquireLock(ROOT);
  if (!release) {
    console.error("پروسهٔ دیگری در حال دانلود مدل است — کمی بعد دوباره اجرا کنید.");
    process.exitCode = 1;
    return;
  }
  try {
    console.log(`مدل: ${MODEL_REPO}`);
    console.log(`مقصد: ${modelDirOf(ROOT)}\n`);
    const dir = await ensureAsrModel({ root: ROOT, force });
    console.log(`\n✓ مدل آماده است: ${dir}`);
    const ffmpeg = await ensureFfmpeg({ root: ROOT, force });
    console.log(ffmpeg ? `✓ ffmpeg: ${ffmpeg}` : "! ffmpeg آماده نشد — برای webm دستی نصب کنید یا FFMPEG_PATH بدهید");
    console.log("\nحجم مدل: ~۴۵۹MB | RAM هنگام اجرا: ~" + human(536 * 1024 * 1024) + " | RTF اندازه‌گیری‌شده: ~0.05");
  } finally {
    release();
  }
}

main().catch((err) => {
  console.error(`\n✗ دانلود مدل ناموفق: ${err.message}`);
  process.exit(1);
});
