#!/usr/bin/env node
/**
 * شروع توسعهٔ سریع برای سیستم‌های با منابع محدود (8GB RAM).
 * 
 * تفاوت با dev-start.mjs:
 *   - بدون بیلد مجدد (از dist قبلی استفاده می‌کند)
 *   - بارگذاری مدل ASR به صورت تنظیم‌شده (با 1 thread)
 *   - غیرفعال‌سازی auto-seed برای سرعت بیشتر
 * 
 * استفاده:
 *   node scripts/dev-start-fast.mjs
 * 
 * نکته: اگر کد تغییر کرد، اول یک بار «npm run build:backend» بزنید.
 */

import { spawn, execSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
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

// پاک کردن PIDهای قدیمی
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
}

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const backendPort = readEnv("PORT", "3100");
const frontendPort = process.env.VITE_PORT || "5175";
const asrEnabled = !/^(0|false|no|off)$/i.test(readEnv("AUTO_ASR", "1"));

const pids = [];
const children = {};

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

console.log("🚀 شروع توسعه (حالت بهینه‌شده برای منابع محدود)");

// اگر dist وجود نداشته باشد، هشدار می‌دهیم
if (!existsSync(resolve(ROOT, "backend", "dist", "main.js"))) {
  console.warn("⚠️  فایل backend/dist/main.js یافت نشد.");
  console.warn("   لطفاً اول اجرا کنید: npm run build:backend");
  console.warn("   سپس دوباره این دستور را بزنید.");
  process.exit(1);
}

// ۱) بک‌اند NestJS (بدون بیلد مجدد)
start("backend", [resolve(ROOT, "backend", "dist", "main.js")]);

// ۲) آماده‌سازی مدل ASR (با 1 thread در تنظیمات)
if (asrEnabled) {
  const asrLog = openSync(resolve(LOG_DIR, "asr.log"), "a");
  const asr = spawn(process.execPath, [resolve(ROOT, "scripts", "asr-setup.mjs")], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", asrLog, asrLog],
  });
  asr.unref();
  console.log("🧠 آماده‌سازی مدل ASR در پس‌زمینه...");
}

// ۳) فرانت Vite
const viteBin = resolve(ROOT, "frontend", "node_modules", "vite", "bin", "vite.js");
if (existsSync(viteBin)) {
  start("frontend", [viteBin, "--port", frontendPort, "--host"], {
    cwd: resolve(ROOT, "frontend"),
    env: { PORT: undefined },
  });
} else {
  console.warn("⚠️  باینری Vite پیدا نشد — فرانت شروع نشد.");
}

writeFileSync(
  PIDS_FILE,
  pids.map((p) => `${p.name}\t${p.pid}`).join("\n") + "\n",
  "utf8",
);

console.log(`✅ شروع شد. بک‌اند: http://localhost:${backendPort} | فرانت: http://localhost:${frontendPort}`);
console.log("   خاموش‌کردن با «npm run stop».");
console.log("   برای تغییر کد بک‌اند: اول npm run build:backend سپس restart کنید.");
