#!/usr/bin/env node
/**
 * شروع توسعهٔ پروژه Nobino (بک‌اند NestJS + فرانت Vite) با یک فرمان.
 *
 * اجرا:
 *   npm run dev
 *
 * پورت‌ها:
 *   - بک‌اند: PORT (پیش‌فرض 3100)
 *   - فرانت:   Vite (پیش‌فرض 5175)
 *
 * شناسه‌های فرایند برای توقف در `.dev.pids` ذخیره می‌شوند
 * (نگاه کنید به scripts/dev-stop.mjs).
 */
import { spawn, execSync, execFileSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIDS_FILE = resolve(ROOT, ".dev.pids");
const LOG_DIR = resolve(ROOT, ".dev-logs");

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function readEnv(name, fallback) {
  try {
    const text = readFileSync(resolve(ROOT, ".env"), "utf8");
    const m = text.match(new RegExp(`^${name}\\s*=\\s*"?(.*?)"?$`, "m"));
    if (m && m[1]) return m[1].trim();
  } catch {
    /* ignore */
  }
  return fallback;
}

// ME-7/۲: فایلPid مانده از kill -9 یا ری‌بوت نباید جلوی اجرای بعدی را بگیرد
if (existsSync(PIDS_FILE)) {
  const stale = readFileSync(PIDS_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  const alive = stale
    .map((l) => l.split("\t"))
    .filter(([, pid]) => Number(pid) && isAlive(Number(pid)));
  if (alive.length) {
    console.error(`⚠️  ${alive.length} فرایند از دور قبل هنوز اجرا می‌شود (${alive.map((a) => a[0]).join("، ")}). اول «npm run stop» بزنید.`);
    process.exit(1);
  }
  rmSync(PIDS_FILE, { force: true });
  console.log("♻️  .dev.pids کهنه بود (هیچ PID زنده‌ای نداشت) — پاک شد.");
}

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const backendPort = readEnv("PORT", "3100");
const frontendPort = process.env.VITE_PORT || "5175";

// ۰) تولید Prisma Client
try {
  const prismaCli = resolve(ROOT, "node_modules", "prisma", "build", "index.js");
  if (existsSync(prismaCli)) {
    console.log("📝 تولید Prisma Client...");
    execFileSync(process.execPath, [prismaCli, "generate"], { stdio: "inherit", cwd: ROOT });
  }
} catch (e) {
  console.warn("⚠️  تولید Prisma Client ناموفق بود:", e.message);
}

// ۱) ساخت بک‌اند (tsc + tsc-alias)
console.log("🔨 ساخت بک‌اند...");
try {
  execSync("npm run build:backend", { stdio: "inherit", cwd: ROOT });
} catch {
  console.error("❌ ساخت بک‌اند ناموفق بود.");
  process.exit(1);
}

const pids = [];
const children = {};

// ME-7/۱: بدون shell — مسیرهای مطلقِ دارای فاصله باعث breakage و هشدار DEP0190 می‌شدند.
function start(name, args, opts = {}) {
  const out = openSync(resolve(LOG_DIR, `${name}.log`), "a");
  console.log(`▶️  ${name}: ${process.execPath} ${args.join(" ")}`);
  const child = spawn(process.execPath, args, {
    cwd: opts.cwd || ROOT,
    stdio: ["ignore", out, out],
    env: { ...process.env, PORT: backendPort, ...opts.env },
  });
  child.on("exit", (code, signal) => console.log(`⏹  ${name} پایان یافت (کد ${code}، سیگنال ${signal ?? "-"})`));
  pids.push({ name, pid: child.pid });
  children[name] = child;
  return child;
}

// ۲) بک‌اند NestJS
start("backend", [resolve(ROOT, "backend", "dist", "main.js")]);

// ۲.۵) آماده‌سازی خودکار مدل محلی گفتار + ffmpeg (فقط بار اول؛ در پس‌زمینه)
// تا نیازی به اجرای دستی «npm run asr:model» نباشد. با AUTO_ASR=0 خاموش می‌شود.
if (!/^(0|false|no|off)$/i.test(readEnv("AUTO_ASR", "1"))) {
  const asrLog = openSync(resolve(LOG_DIR, "asr.log"), "a");
  const asr = spawn(process.execPath, [resolve(ROOT, "scripts", "asr-setup.mjs")], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", asrLog, asrLog],
  });
  asr.unref();
  console.log("🧠 آماده‌سازی مدل محلی گفتار در پس‌زمینه (لاگ: .dev-logs/asr.log)");
}

// ۳) فرانت Vite (باینری مستقیم، بدون پوستهٔ npm تا PID قابل توقف بماند)
const viteBin = resolve(ROOT, "frontend", "node_modules", "vite", "bin", "vite.js");
if (existsSync(viteBin)) {
  start("frontend", [viteBin, "--port", frontendPort, "--host"], {
    cwd: resolve(ROOT, "frontend"),
    env: { PORT: undefined },
  });
} else {
  console.warn("⚠️  باینری Vite پیدا نشد (frontend/node_modules/vite) — فرانت شروع نشد. اول «npm install» در frontend.");
}

writeFileSync(
  PIDS_FILE,
  pids.map((p) => `${p.name}\t${p.pid}`).join("\n") + "\n",
  "utf8",
);

function tailLog(name, lines = 15) {
  try {
    const t = readFileSync(resolve(LOG_DIR, `${name}.log`), "utf8").trimEnd().split(/\r?\n/);
    return t.slice(-lines).join("\n");
  } catch {
    return "(لاگ خوانده نشد)";
  }
}

// ME-7/۳: پیام موفقیت فقط وقتی که فرایندها واقعاً پاسخ می‌دهند چاپ شود.
const startedAt = Date.now();
const DEADLINE_MS = 30_000;

async function waitHttp(url, name) {
  while (Date.now() - startedAt < DEADLINE_MS) {
    const child = children[name];
    if (child && child.exitCode !== null) return false;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      /* هنوز بالا نیامده */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const backendOk = await waitHttp(`http://127.0.0.1:${backendPort}/api/health`, "backend");
const frontendOk = children.frontend
  ? await waitHttp(`http://127.0.0.1:${frontendPort}/`, "frontend")
  : false;

if (!backendOk) {
  console.error(`❌ بک‌اند روی http://127.0.0.1:${backendPort}/api/health پاسخ نداد (${Math.round((Date.now() - startedAt) / 1000)} ثانیه).`);
  console.error(`   ${tailLog("backend")}`);
  console.error(`   کامل: ${resolve(LOG_DIR, "backend.log")} | توقف با «npm run stop».`);
  process.exitCode = 1;
} else if (children.frontend && !frontendOk) {
  console.error(`❌ بک‌اند سالم است ولی Vite روی http://localhost:${frontendPort} پاسخ نداد.`);
  console.error(`   ${tailLog("frontend")}`);
  process.exitCode = 1;
} else {
  console.log(`✅ شروع شد. بک‌اند: http://localhost:${backendPort} | فرانت: http://localhost:${frontendPort}`);
  console.log("   خاموش‌کردن با «npm run stop».");
}
