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
import { spawn, execSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIDS_FILE = resolve(ROOT, ".dev.pids");
const LOG_DIR = resolve(ROOT, ".dev-logs");
const k = (v, fb) => (v === undefined || v === null || v === "" ? fb : v);

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

if (existsSync(PIDS_FILE)) {
  console.error("⚠️  قبلاً اجرا شده (.dev.pids موجود است). اول «npm run stop» بزنید.");
  process.exit(1);
}

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

const backendPort = readEnv("PORT", "3100");
const frontendPort = process.env.VITE_PORT || "5175";
const backendCmd = process.env.NODE_ENV === "production" ? "start:backend" : "dev:backend";

// ۰) تولید Prisma Client
try {
  const prismaCli = resolve(ROOT, "node_modules", "prisma", "build", "index.js");
  if (existsSync(prismaCli)) {
    console.log("📝 تولید Prisma Client...");
    execSync(`node ${prismaCli} generate`, { stdio: "inherit", cwd: ROOT });
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

function start(name, cmd, args) {
  const out = openSync(resolve(LOG_DIR, `${name}.log`), "a");
  console.log(`▶️  ${name}: ${cmd} ${args.join(" ")}`);
  const child = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ["ignore", out, out],
    shell: process.platform === "win32",
    env: { ...process.env, PORT: backendPort },
  });
  child.on("exit", (code) => console.log(`⏹  ${name} با کد ${code} پایان یافت.`));
  pids.push({ name, pid: child.pid });
  return child;
}

// ۲) بک‌اند NestJS
start("backend", "node", [resolve(ROOT, "backend", "dist", "main.js")]);

// ۳) فرانت Vite روی پورت 5175
start("frontend", "npm", ["run", "dev:frontend", "--", "--port", frontendPort, "--host"]);

writeFileSync(
  PIDS_FILE,
  pids.map((p) => `${p.name}\t${p.pid}`).join("\n") + "\n",
  "utf8",
);

console.log(`✅ شروع شد. بک‌اند: http://localhost:${backendPort} | فرانت: http://localhost:${frontendPort}`);
console.log("   خاموش‌کردن با «npm run stop».");
