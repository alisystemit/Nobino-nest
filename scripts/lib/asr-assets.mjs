// زیرساخت مشترک آماده‌سازی خودکار دارایی‌های ASR محلی:
//   • مدل Shenava/sherpa-onnx (۴۵۹MB) — قابل‌ادامه (Range) با تلاش مجدد
//   • باینری ffmpeg — فقط اگر روی سیستم نباشد (در داکر از قبل نصب است)
//
// مصرف‌کننده‌ها: scripts/asr-setup.mjs (اجرای خودکار در بوت/توسعه)،
// scripts/download-asr-model.mjs (CLI دستی) و scripts/check-asr.mjs.
import { createWriteStream, existsSync, mkdirSync, openSync, closeSync, rmSync, renameSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { arch, platform } from "node:os";
import { join } from "node:path";

export const MODEL_REPO = "Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx";
export const MODEL_DIR_NAME = "shenava-koochik-v1.0-sherpa-onnx";
export const MODEL_FILES = [
  { name: "model.onnx", minBytes: 400 * 1024 * 1024 },
  { name: "tokens.txt", minBytes: 5_000 },
  { name: "persian_itn.py", minBytes: 0 },
  { name: "hotwords_fa.txt", minBytes: 0 },
];

const FFMPEG_RELEASE = process.env.FFMPEG_RELEASE || "b6.1.1";
const MAX_ATTEMPTS = 40;
const LOCK_STALE_MS = 6 * 60 * 60 * 1000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function human(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export const modelDirOf = (root) => join(root, "models", MODEL_DIR_NAME);
export const ffmpegBinOf = (root) =>
  join(root, "models", ".bin", platform() === "win32" ? "ffmpeg.exe" : "ffmpeg");

/** قفل سادهٔ فایل تا دو پروسه/ریپلیکا هم‌زمان یک فایل .part را خراب نکنند. */
export function acquireLock(root) {
  const dir = join(root, "models");
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, ".asr-setup.lock");
  try {
    const fd = openSync(lock, "wx");
    writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
    closeSync(fd);
    return () => rmSync(lock, { force: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    try {
      if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
        rmSync(lock, { force: true });
        return acquireLock(root);
      }
    } catch {
      /* قفل بین دو فراخوانی پاک شد؛ تلاش بعدی */
    }
    return null;
  }
}

/**
 * دانلود با Range و ادامه از فایل .part. HuggingFace/GitHub روی اتصال‌های
 * طولانی گاهی stream را می‌بندند؛ پس هر قطعی فقط یعنی «دوباره از همان بایت».
 */
export async function downloadResumable({ url, target, minBytes = 0, label, force = false, log = console.log }) {
  const partial = `${target}.part`;
  if (force) rmSync(partial, { force: true });

  let offset = existsSync(partial) ? statSync(partial).size : 0;
  let total = 0;
  let lastPrint = 0;
  let attempt = 0;
  if (offset > 0) log(`  ↻ ادامهٔ ${label} از ${human(offset)}`);

  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const headers = { "user-agent": "nobino-asr-setup" };
    const token = (process.env.HF_TOKEN ?? process.env.HUGGINGFACE_API_KEY ?? "").trim();
    if (token && url.includes("huggingface.co")) headers.authorization = `Bearer ${token}`;
    if (offset > 0) headers.range = `bytes=${offset}-`;

    let res;
    try {
      res = await fetch(url, { headers, redirect: "follow" });
    } catch (err) {
      log(`  ! قطع اتصال (${err.message}) — تلاش ${attempt}…`);
      await sleep(Math.min(2000 * attempt, 15_000));
      continue;
    }

    if (res.status === 416) break; // بازه از انتهای فایل گذشته = کامل
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${res.status}: دسترسی رد شد — برای HuggingFace ممکن است HF_TOKEN لازم باشد`);
    }
    if (!res.ok || !res.body) {
      if (res.status >= 500 || res.status === 429) {
        await sleep(Math.min(2000 * attempt, 15_000));
        continue;
      }
      throw new Error(`HTTP ${res.status} برای ${label}`);
    }

    // اگر سرور Range را نادیده بگیرد (200)، از صفر می‌نویسیم.
    if (offset > 0 && res.status !== 206) {
      log("  سرور Range را نپذیرفت — شروع از صفر");
      offset = 0;
      rmSync(partial, { force: true });
    }

    const chunkLen = Number(res.headers.get("content-length") ?? "0");
    if (res.status === 206) total = offset + chunkLen;
    else if (!total && chunkLen) total = chunkLen;

    const before = offset;
    let seen = offset;
    const reader = Readable.fromWeb(res.body);
    reader.on("data", (chunk) => {
      seen += chunk.length;
      const now = Date.now();
      if (now - lastPrint > 1000) {
        lastPrint = now;
        const pct = total ? ` (${((seen / total) * 100).toFixed(1)}%)` : "";
        log(`  ${label}: ${human(seen)}${pct}`);
      }
    });

    try {
      await pipeline(reader, createWriteStream(partial, { flags: offset > 0 ? "a" : "w" }));
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`دانلود ${label} ناموفق: ${err.message}`);
      log(`  ! اتصال قطع شد (${err.message}) — تلاش ${attempt}…`);
      offset = existsSync(partial) ? statSync(partial).size : before;
      await sleep(1000);
      continue;
    }

    offset = existsSync(partial) ? statSync(partial).size : seen;
    if (total && offset >= total) break;
    if (!total && offset > before) break;
    if (offset <= before) {
      log(`  ! پیشرفتی نداشت — تلاش ${attempt}`);
      await sleep(1500 * attempt);
    }
  }

  const size = existsSync(partial) ? statSync(partial).size : 0;
  if (size < minBytes || (total && size < total)) {
    throw new Error(
      `دانلود ${label} ناقص ماند (${human(size)}${total ? ` از ${human(total)}` : ""}) — دوباره اجرا کنید تا ادامه دهد`
    );
  }

  rmSync(target, { force: true });
  renameSync(partial, target);
  log(`  ✓ ${label} — ${human(size)}`);
}

function ffmpegOnPath() {
  const bin = (process.env.FFMPEG_PATH ?? "").trim() || "ffmpeg";
  return spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0 ? bin : null;
}

/**
 * ffmpeg: اگر تنظیم/محیط/PATH موجود باشد همان استفاده می‌شود؛ وگرنه نسخهٔ
 * استاتیک را در models/.bin/ دانلود می‌کند (بدون نیاز به نصب دستی).
 */
export async function ensureFfmpeg({ root, force = false, log = console.log } = {}) {
  const local = ffmpegBinOf(root);
  if (!force && existsSync(local)) return local;

  const explicit = (process.env.FFMPEG_PATH ?? "").trim();
  if (!force && explicit) return explicit;

  const onPath = ffmpegOnPath();
  if (!force && onPath) return onPath;

  const plat = platform();
  const cpu = arch();
  if (!["win32", "linux", "darwin"].includes(plat) || !["x64", "arm64"].includes(cpu)) {
    log(`  ! ffmpeg برای ${plat}-${cpu} پشتیبانی خودکار ندارد؛ دستی نصب کنید`);
    return null;
  }

  mkdirSync(join(root, "models", ".bin"), { recursive: true });
  const part = `${local}.part`;
  rmSync(part, { force: true });
  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/ffmpeg-${plat}-${cpu}.gz`;
  log(`  دانلود ffmpeg (${plat}-${cpu})…`);

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "nobino-asr-setup" } });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createGunzip(), createWriteStream(part));
      if (!existsSync(part) || statSync(part).size < 5 * 1024 * 1024) throw new Error("فایل دانلودشده معتبر نیست");
      rmSync(local, { force: true });
      renameSync(part, local);
      if (plat !== "win32") {
        const { chmodSync } = await import("node:fs");
        chmodSync(local, 0o755);
      }
      log(`  ✓ ffmpeg — ${human(statSync(local).size)}`);
      return local;
    } catch (err) {
      rmSync(part, { force: true });
      if (attempt === 5) {
        log(`  ! دانلود ffmpeg ناموفق: ${err.message}`);
        return null;
      }
      await sleep(1500 * attempt);
    }
  }
  return null;
}

/** مدل را دانلود/تکمیل می‌کند. */
export async function ensureAsrModel({ root, modelDir, force = false, log = console.log } = {}) {
  const dest = modelDir || modelDirOf(root);
  mkdirSync(dest, { recursive: true });
  for (const file of MODEL_FILES) {
    const target = join(dest, file.name);
    if (!force && existsSync(target) && statSync(target).size >= file.minBytes) {
      log(`  ✓ ${file.name} از قبل موجود است (${human(statSync(target).size)})`);
      continue;
    }
    await downloadResumable({
      url: `https://huggingface.co/${MODEL_REPO}/resolve/main/${file.name}?download=true`,
      target,
      minBytes: file.minBytes,
      label: file.name,
      force,
      log,
    });
  }
  return dest;
}
