/**
 * بارگذاری ساده فایل .env (بدون وابستگی dotenv).
 * اول backend/.env و سپس ریشه پروژه را می‌خواند؛ مقادیر موجود در
 * process.env بازنویسی نمی‌شوند (رفتار استاندارد dotenv).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvFiles() {
  const candidates = [
    resolve(__dirname, "../.env"), // backend/.env (در حالت build: dist/../.env)
    resolve(process.cwd(), ".env"),
    resolve(__dirname, "../../.env"), // ریشه پروژه (nobino-nest/.env)
    resolve(process.cwd(), "../.env"),
  ];
  const seen = new Set<string>();
  for (const file of candidates) {
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
