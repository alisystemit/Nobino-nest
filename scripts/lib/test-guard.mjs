// گارد «نبودِ چیز لازم = شکست، نه skip» (ME-9 از docs/audit-scripts-2026-11-05.md)
// skip بی‌صدا یعنی `npm test` سبز بدون آنکه مهم‌ترین تست‌های امنیتی/استقرار اجرا
// شده باشند. پس پیش‌فرض failure است و با SKIP_MISSING_ARTIFACTS=1 می‌توان آگاهانه
// (مثلاً در CI سبکِ بدون بیلد) به همان skip برگشت.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
export const ALLOW_SKIP = /^(1|true|yes)$/i.test(String(process.env.SKIP_MISSING_ARTIFACTS || ""));

const rel = (p) => p.replace(ROOT.replace(/\\/g, "/") + "/", "").replace(/\\/g, "/");

/**
 * @param {import("node:test").TestContext} t
 * @param {string} path مسیر فایل/پوشهٔ لازم
 * @param {string} hint فرمانی که آن را می‌سازد
 * @returns {boolean} true =artifact هست و تست ادامه دهد؛ false = متوقف شد
 */
export function requireArtifact(t, path, hint) {
  if (existsSync(path)) return true;
  const what = rel(String(path));
  if (ALLOW_SKIP) {
    t.skip(`${what} نیست (SKIP_MISSING_ARTIFACTS=1) — با «${hint}» ساخته می‌شود`);
    return false;
  }
  t.fail(`«${what}» موجود نیست → این تست‌ها اصلاً اجرا نشدند؛ اول «${hint}» (یا «npm run verify»). برای رد شدنِ آگاهانه: SKIP_MISSING_ARTIFACTS=1`);
  return false;
}

/** برای وابستگی‌های npm که در node_modulesِ یک سمت نشسته‌اند */
export function requireDep(t, name, side = "frontend") {
  const p = join(ROOT, side, "node_modules", name);
  return requireArtifact(t, p, `npm --prefix ${side} install`);
}

/** برای فرمان‌های بیرونی (bash و…) که بدونشان دسته‌ای کامل اجرا نمی‌شود */
export function requireCommand(t, cmd, hint) {
  const ok = spawnSync(cmd, ["--version"], { encoding: "utf8" }).error === undefined;
  if (ok) return true;
  if (ALLOW_SKIP) {
    t.skip(`«${cmd}» در PATH نیست (SKIP_MISSING_ARTIFACTS=1)`);
    return false;
  }
  t.fail(`«${cmd}» در PATH نیست → این تست‌ها اصلاً اجرا نشدند؛ ${hint} (یا SKIP_MISSING_ARTIFACTS=1)`);
  return false;
}
