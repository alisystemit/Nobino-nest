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

// روی ویندوز whole process-tree با taskkill /T /F بسته می‌شود (npm child از vite)؛
// روی یونیکس SIGTERM کافی است تا خودِ پروسه graceful خاموش شود.
const winTaskkillArgs = ["/T", "/F"];
const posixSignal = "SIGTERM";

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
      spawnSync("taskkill", ["/PID", String(p), ...winTaskkillArgs], { stdio: "ignore" });
    } else {
      process.kill(p, posixSignal);
    }
    console.log(`⏹  توقف ${name} (PID ${p})`);
  } catch {
    console.warn(`⚠️  امکان توقف ${name} نبود`);
  }
}

rmSync(PIDS_FILE, { force: true });
console.log("✅ همهٔ فرایندها متوقف شدند.");
