#!/usr/bin/env node
/**
 * ساخت نسخهٔ قابل استقرار (release) پروژهٔ Nobino — نسخهٔ NestJS.
 *
 * اجرا:
 *   node scripts/build-release.mjs            # نصب + generate + build هر دو سمت + smoke-test
 *   node scripts/build-release.mjs --skip-install
 *   node scripts/build-release.mjs --no-smoke
 *   node scripts/build-release.mjs --no-frontend   # فقط بک‌اند (بیلد و prerender فرانت انجام نمی‌شود)
 *   node scripts/build-release.mjs --strict    # خطای تایپ = شکست (پیش‌فرض: هشدار)
 *
 * prerender فقط وقتی sitemap.xml/robots.txt می‌نویسد که مبنا (VITE_SITE_URL یا
 * SITE_URL) دامنهٔ عمومی باشد؛ در غیر آن نشانی لوکال روی دیسک نمی‌سوزد.
 *
 * چرا «آشتی‌جو»؟ این مخزن در چند session هم‌زمان ویرایش می‌شود، پس ممکن است در
 * لحظهٔ بیلد چند فایلِ کارِ‌در‌ادامه خطای تایپ داشته باشند؛`tsc` با وجود آن‌ها
 * خروجی می‌گیرد. برای pipeline استقرار، معیار واقعی «وجود dist معتبر + بوت موفق
 * سرور» است؛ خطاهای تایپ چاپ و هشدار داده می‌شوند ولی با `--strict` سخت‌گیرانه
 * رفتار می‌شود. (معیار توسعه: `npm run build:backend` که خطا را شکست می‌دهد؛
 * در حال حاضر بک‌اند بدون خطا بیلد می‌شود.)
 */
import { spawnSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);

const log = (...a) => console.log("•", ...a);
const ok = (...a) => console.log("✅", ...a);
const warn = (...a) => console.log("⚠️ ", ...a);
const fail = (msg, extra) => {
  console.error("❌", msg);
  if (extra) console.error(extra);
  process.exit(1);
};

const KNOWN_FLAGS = ["--strict", "--skip-install", "--no-frontend", "--no-smoke", "--help", "-h"];
const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN_FLAGS.includes(a));
if (unknown.length) {
  console.error(`❌ گزینهٔ ناشناخته: ${unknown.join(", ")}\n   مجاز: ${KNOWN_FLAGS.filter((f) => f !== "-h").join(", ")}`);
  process.exit(1);
}
if (has("--help") || argv.includes("-h")) {
  console.log(`کاربرد: node scripts/build-release.mjs [گزینه]

  --strict        خطاهای تایپ اسکریپت = شکست بیلد
  --skip-install  npm install اجرا نمی‌شود (سرورهای آماده)
  --no-frontend   بیلد فرانت‌اند و prerender رد می‌شود
  --no-smoke      بوت سرور برای smoke test رد می‌شود

متغیرهای محیطی مؤثر: SMOKE_PORT (عدد)، SMOKE_DB_REQUIRED (0|1)،
SMOKE_PRELOAD (--require دلخواه برای بوت)، PRERENDER_API (سرور زنده در حالت --no-smoke)،
VITE_SITE_URL / SITE_URL (مبنای سئو؛ اگر نبود prerender انجام نمی‌شود).`);
  process.exit(0);
}

const STRICT = has("--strict");
const SKIP_INSTALL = has("--skip-install");
const SKIP_FRONTEND = has("--no-frontend");
const SKIP_SMOKE = has("--no-smoke");
const SMOKE_PORT = (() => {
  const raw = (process.env.SMOKE_PORT || "").trim();
  if (raw === "") return 3977;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) fail(`SMOKE_PORT نامعتبر است: «${raw}» — یک عدد بین 1024 و 65535 بدهید.`);
  return n;
})();

function run(cmd, args, opts = {}) {
  const useShell = process.platform === "win32";
  const res = useShell
    // در ویندوز npm/npx فقط با shell حل می‌شوند؛ آرگومان‌ها ثابت و داخلی‌اند
    ? spawnSync([cmd, ...args].join(" "), {
        cwd: opts.cwd || ROOT,
        stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
        encoding: "utf8",
        shell: true,
        env: { ...process.env, ...(opts.env || {}) },
      })
    : spawnSync(cmd, args, {
        cwd: opts.cwd || ROOT,
        stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "inherit",
        encoding: "utf8",
        env: { ...process.env, ...(opts.env || {}) },
      });
  return res;
}

// ── ۰) بررسی متغیرهای محیطی ────────────────────────────────────────
function readEnvFile(name) {
  for (const file of [".env.production", ".env"]) {
    const p = join(ROOT, file);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp(`^${name}\\s*=\\s*"?(.*?)"?$`, "m"));
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}
const envValue = (name) => (process.env[name] || readEnvFile(name) || "").trim();

log("بررسی محیط...");
if (!envValue("DATABASE_URL")) {
  warn("DATABASE_URL پیدا نشد — migrate/build بدون DB کار می‌کند ولی سرور بالا نمی‌آید.");
}
if (!envValue("JWT_SECRET")) {
  warn("JWT_SECRET تنظیم نشده؛ مقدار پیش‌فرض توسعه استفاده می‌شود (برای پروداکشن خطرناک است).");
}

// ── ۱) نصب وابستگی‌ها ──────────────────────────────────────────────
if (!SKIP_INSTALL) {
  for (const dir of ["", "backend", "frontend"]) {
    const cwd = dir ? join(ROOT, dir) : ROOT;
    const label = dir || "root";
    const cmd = existsSync(join(cwd, "package-lock.json")) ? ["ci"] : ["install"];
    log(`npm ${cmd[0]} (${label})...`);
    const res = run("npm", cmd, { cwd });
    if (res.status !== 0) fail(`npm ${cmd[0]} در ${label} ناموفق بود`);
  }
} else {
  log("npm install رد شد (--skip-install)");
}

// ── ۲) Prisma Client ───────────────────────────────────────────────
const prismaCli = join(ROOT, "node_modules", "prisma", "build", "index.js");
if (existsSync(prismaCli)) {
  log("تولید Prisma Client...");
  const res = run("node", [prismaCli, "generate", "--schema", join("prisma", "schema.prisma")]);
  if (res.status !== 0) fail("prisma generate ناموفق بود");
} else {
  warn("CLI پریزما در node_modules نیست؛ نصب وابستگی‌ها کامل نشده؟");
}

// ── ۳) بیلد بک‌اند ─────────────────────────────────────────────────
log("ساخت بک‌اند (tsc + tsc-alias)...");
const backendDir = join(ROOT, "backend");
const tsc = run("npx", ["tsc", "-p", "tsconfig.build.json"], { cwd: backendDir, capture: true });
const tscOut = `${tsc.stdout || ""}${tsc.stderr || ""}`;
if (tsc.status !== 0) {
  const lines = tscOut.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
  if (STRICT) fail("tsc بک‌اند خطا دارد (--strict):\n" + lines.join("\n"));
  warn(`tsc بک‌اند ${lines.length} خطای تایپ گزارش کرد (dist ساخته می‌شود):`);
  for (const l of lines.slice(0, 12)) console.log("    " + l);
  if (lines.length > 12) console.log(`    … و ${lines.length - 12} خطای دیگر`);
}
const alias = run("npx", ["tsc-alias", "-p", "tsconfig.build.json"], { cwd: backendDir, capture: true });
if (alias.status !== 0) fail("tsc-alias ناموفق بود", alias.stderr);

// ── ۴) بیلد فرانت ──────────────────────────────────────────────────
if (!SKIP_FRONTEND) {
  const frontendDir = join(ROOT, "frontend");
  const feTsc = run("npx", ["tsc", "-b"], { cwd: frontendDir, capture: true });
  if (feTsc.status !== 0) {
    const lines = `${feTsc.stdout || ""}${feTsc.stderr || ""}`.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
    if (STRICT) fail("tsc فرانت خطا دارد (--strict):\n" + lines.join("\n"));
    warn(`tsc فرانت ${lines.length} خطای تایپ گزارش کرد (vite build typecheck نمی‌کند):`);
    for (const l of lines.slice(0, 8)) console.log("    " + l);
  }
  log("ساخت SPA (vite build)...");
  // NODE_ENV را صریح پروداکشن می‌گذاریم: .env ریشه `NODE_ENV="development"` دارد و
  // Vite (به‌خاطر envDir همان پوشه) آن را برای build هم برمی‌دارد، پس بدون این خط
  // راکتِ development در dist می‌نشیند. frontend/scripts/vite-build.mjs همین کاری را
  // برای `npm run build` می‌کند؛ اینجا مستقیم‌ترین معادل است.
  const vite = run("node", ["scripts/vite-build.mjs"], { cwd: frontendDir });
  if (vite.status !== 0) fail("vite build ناموفق بود");
  log("prerender بعد از بوت سرور انجام می‌شود (تا صفحات سالن‌ها از API گرفته شوند)...");
} else {
  log("بیلد فرانت رد شد (--no-frontend)");
}

// ── ۵) بررسی خروجی‌ها ──────────────────────────────────────────────
const distMain = join(backendDir, "dist", "main.js");
const distIndex = join(ROOT, "frontend", "dist", "index.html");
if (!existsSync(distMain)) fail("backend/dist/main.js ساخته نشد");
ok("backend/dist/main.js موجود است");
if (!SKIP_FRONTEND && !existsSync(distIndex)) fail("frontend/dist/index.html ساخته نشد");

// ── ۶) smoke test: بوت واقعی سرور ──────────────────────────────────
/** prerender صفحات سئو: به سرورِ در حال اجرا نیاز دارد.
 *  مبنا فقط از VITE_SITE_URL/SITE_URL گرفته می‌شود؛ هرگز آدرس خودِ سرور smoke
 *  (۱۲۷.۰.۰.۱:پورت) جانشین دامنه نمی‌شود — prerender در آن حالت canonical
 *  نسبی می‌نویسد و sitemap را روی دیسک نمی‌سوزاند. */
function runPrerender(apiBase) {
  const site = envValue("VITE_SITE_URL") || envValue("SITE_URL") || envValue("VITE_APP_URL");
  if (!site) {
    warn("مبنای سئو مشخص نیست (VITE_SITE_URL/SITE_URL در env یا .env) — prerender انجام نمی‌شود تا sitemap/robots لوکال روی دیست نوشته یا حذف نشود.");
    return false;
  }
  const res = run("node", ["prerender.mjs"], {
    cwd: join(ROOT, "frontend"),
    capture: true,
    env: { PRERENDER_API: apiBase, VITE_SITE_URL: site },
  });
  const out = `${res.stdout || ""}${res.stderr || ""}`.trim();
  if (res.status === 0) {
    for (const line of out.split(/\r?\n/).filter(Boolean).slice(-3)) log("prerender: " + line);
  } else {
    warn("prerender کامل نشد؛ صفحات عمومی با shell اسپا سرو می‌شوند.");
    for (const line of out.split(/\r?\n/).filter(Boolean).slice(-4)) warn("prerender: " + line);
  }
  return res.status === 0;
}

/** آیا سروری روی این آدرس پاسخ می‌دهد؟ (برای prerender در حالت --no-smoke) */
async function apiReachable(apiBase) {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 2500);
    const res = await fetch(`${apiBase}/api/health`, { signal: ac.signal }).finally(() => clearTimeout(timer));
    return res.ok || res.status === 503;
  } catch {
    return false;
  }
}

if (SKIP_SMOKE) {
  log("smoke test رد شد (--no-smoke)");
  // بدون سرورِ در حال اجرا هرگز prerender نمی‌کنیم؛ در غیر این صورت
  // sitemap/canonical با آدرس لوکالِ smoke-test روی دیسک می‌سوزد (B2).
  const explicitApi = (process.env.PRERENDER_API || "").trim();
  if (SKIP_FRONTEND) {
    log("prerender رد شد (--no-frontend)");
  } else if (!explicitApi) {
    warn("prerender در حالت --no-smoke انجام نشود (سروری در حال اجرا نیست). برای ساخت صفحات سئو از smoke test استفاده کنید یا PRERENDER_API را به سرور زندهٔ خود بچرخانید.");
  } else if (await apiReachable(explicitApi)) {
    runPrerender(explicitApi);
  } else {
    warn(`PRERENDER_API=${explicitApi} در دسترس نیست — prerender انجام نشد.`);
  }
} else {
  log(`بوت سرور روی پورت ${SMOKE_PORT} برای smoke test...`);
  // SMOKE_PRELOAD: یک --require دلخواه (مثلاً stub اتصال Prisma) برای محیطی که
  // دیتابیس ندارد؛ در استقرار واقعی لازم نیست.
  const preload = (process.env.SMOKE_PRELOAD || "").trim();
  const child = spawn("node", [...(preload ? ["--require", preload] : []), distMain], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(SMOKE_PORT),
      NODE_ENV: process.env.NODE_ENV || "production",
      SERVE_FRONTEND: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bootLog = "";
  child.stdout.on("data", (d) => (bootLog += d.toString()));
  child.stderr.on("data", (d) => (bootLog += d.toString()));

  const deadline = Date.now() + 30000;
  let health = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 700));
    try {
      const res = await fetch(`http://127.0.0.1:${SMOKE_PORT}/api/health?db=1`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        health = await res.json();
        break;
      }
    } catch {
      if (child.exitCode !== null) break;
    }
  }

  const apiBase = `http://127.0.0.1:${SMOKE_PORT}`;
  let spaStatus = 0;
  let spaIsHtml = false;
  let deepStatus = 0;
  if (health) {
    try {
      const res = await fetch(`${apiBase}/`, { signal: AbortSignal.timeout(5000) });
      spaStatus = res.status;
      spaIsHtml = (res.headers.get("content-type") || "").includes("text/html");
    } catch {
      /* keep defaults */
    }
    try {
      // مسیر عمیق: باید با fallback اسپا یا صفحهٔ prerender شده پاسخ دهد (نه ۴۰۴)
      deepStatus = (await fetch(`${apiBase}/packages`, { signal: AbortSignal.timeout(5000) })).status;
    } catch {
      /* keep defaults */
    }
    // prerender در همین لحظه که سرور بالاست اجرا می‌شود تا صفحات سالن‌ها ساخته شوند
    if (!SKIP_FRONTEND) runPrerender(apiBase);
  }

  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  if (child.exitCode === null) child.kill("SIGKILL");

  if (!health) {
    const dbDown = /Can't reach database server|P1001|ECONNREFUSED/i.test(bootLog);
    // شکست به‌خاطر نداشتن دیتابیس «موفق» حساب نمی‌شود؛ صریحً با SMOKE_DB_REQUIRED=0 رد کنید.
    if (dbDown && /^(0|false|no)$/i.test(process.env.SMOKE_DB_REQUIRED || "")) {
      warn("دیتابیس در دسترس نبود و با SMOKE_DB_REQUIRED=0 رد شد — smoke test کامل انجام نشده است.");
      console.error(bootLog.split(/\r?\n/).filter((l) => /Prisma|P100|database/i.test(l)).slice(0, 4).join("\n"));
    } else {
      console.error(bootLog.slice(-3000));
      if (dbDown) {
        fail("سرور بالا نیامد: دیتابیس در دسترس نیست. PostgreSQL را بالا بیاورید (یا DATABASE_URL را درست کنید)؛ اگر واقعاً بدون DB تست می‌کنید: SMOKE_DB_REQUIRED=0");
      }
      fail("سرور در 30 ثانیه بالا نیامد /api/health نداد");
    }
  } else {
    ok(`/api/health → ${health.status} | db=${health.db || "n/a"} | servingSpa=${health.servingSpa}`);
    if (health.db === "down") warn("دیتابیس از /api/health?db=1 پاسخ نداد (liveness همچنان 200 است).");
    if (existsSync(distIndex)) {
      if (spaStatus === 200 && spaIsHtml) ok(`SPA در / پاسخ داد (HTTP ${spaStatus})`);
      else fail(`SPA سرو نشد (HTTP ${spaStatus}, html=${spaIsHtml})`);
      if (deepStatus === 200) ok("fallback اسپا در مسیر عمیق /packages کار کرد");
      else fail(`مسیر عمیق /packages کد ${deepStatus} داد — fallback اسپا شکسته است (بروزر رفرش روی مسیرهای عمیق 404 می‌گیرد).`);
    }
  }
}

ok("release آماده است. شروع با: node scripts/paas-start.mjs");
