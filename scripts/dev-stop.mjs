#!/usr/bin/env node
/**
 * خاموش‌کردن فرایندهای توسعهٔ Nobino (بک‌اند + فرانت).
 * شناسه‌های فرایند از `.dev.pids` خوانده می‌شوند.
 */
import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PIDS_FILE = resolve(ROOT, ".dev.pids");

// روی ویندوز، kill برنامه‌ای را متوقف می‌کند؛ روی یونیکس SIGTERM می‌فرستد.
const killArg = process.platform === "win32" ? "/T /F" : "-9";

if (!existsSync(PIDS_FILE)) {
  console.log("ℹ️  فرایندی در حال اجرا نیست (فایل .dev.pids وجود ندارد).");
  process.exit(0);
}

const lines = readFileSync(PIDS_FILE, "utf8").split(/\r?\n/).filter(Boolean);
for (const line of lines) {
  const [name, pid] = line.split("\t");
  const p = Number(pid);
  if (!p) continue;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(p), killArg], { stdio: "ignore" });
    } else {
      process.kill(p, "SIGTERM");
    }
    console.log(`⏹  توقف ${name} (PID ${p})`);
  } catch {
    console.warn(`⚠️  امکان توقف ${name} نبود`);
  }
}

rmSync(PIDS_FILE, { force: true });
console.log("✅ همهٔ فرایندها متوقف شدند.");
