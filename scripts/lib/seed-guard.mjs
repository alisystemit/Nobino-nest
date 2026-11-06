// گارد مشترک اسکریپت‌های seed: یک قانون برای همه (ME-12) و بررسی **پیش از** ساخت
// PrismaClient (ME-13)؛ پرچم ناشناخته و تایپو نباید یعنی «پاک‌سازی/تزریق کامل» (ME-14).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_ENV = join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env");

/** NODE_ENV از شل می‌آید یا از .env؛ اگر هیچ‌کدام نبود همان .env را می‌خوانیم تا
 *  گارد به بارگذاری lazy خودِ Prisma وابسته نماند. */
function resolveNodeEnv() {
  if (process.env.NODE_ENV) return process.env.NODE_ENV;
  try {
    const m = readFileSync(ROOT_ENV, "utf8").match(/^\s*NODE_ENV\s*=\s*["']?([^"'\n]+?)["']?\s*$/m);
    if (m) return m[1];
  } catch {
    /* .env ندارد */
  }
  return "";
}

/**
 * پرچم‌ها + گارد پروداکشن. قبل از `import` شدنِ هر کلاینتی صدا زده می‌شود.
 * @param {string} callerUrl `import.meta.url` خودِ اسکریپت (برای چاپ هدر راهنما)
 * @param {string[]} knownFlags پرچم‌های مجاز (بدون --help/-h که همیشه مجاز است)
 * @param {string} why دلیل خطرناک بودنِ اجرا روی پروداکشن، در یک خط
 * @returns {{ args: string[], has: (flag: string) => boolean }}
 */
export function seedGuard(callerUrl, knownFlags, why) {
  const flags = [...new Set([...knownFlags, "--help", "-h"])];
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    try {
      const src = readFileSync(fileURLToPath(callerUrl), "utf8");
      const block = src.match(/\/\*\*([\s\S]*?)\*\//);
      console.log((block ? block[1] : "").replace(/^\s*\* ?/gm, "").replace(/^#!.*\n/, "").trim());
    } catch {
      console.log(`مجاز: ${flags.join(" ")}`);
    }
    process.exit(0);
  }

  const unknown = args.filter((a) => a.startsWith("-") && !flags.includes(a));
  if (unknown.length) {
    console.error(`❌ پرچم ناشناخته: ${unknown.join(" ، ")}\n   مجاز: ${flags.join(" ")}`);
    process.exit(1);
  }

  const isProd = String(resolveNodeEnv() || "").trim().toLowerCase() === "production";
  const allowed = !isProd || /^(1|true|yes)$/i.test(String(process.env.ALLOW_PROD_SEED || "").trim());
  if (!allowed) {
    console.error(`🛑 روی production اجرا نمی‌شود — ${why}`);
    console.error("   اگر واقعاً می‌خواهید: ALLOW_PROD_SEED=1 <همان فرمان>");
    process.exit(1);
  }

  return { args, has: (f) => args.includes(f) };
}
