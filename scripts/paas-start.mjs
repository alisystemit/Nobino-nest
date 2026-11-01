#!/usr/bin/env node
/**
 * شروع پروژهٔ Nobino (نسخهٔ NestJS) روی PaaS و سرور.
 *
 * این فایل نقطهٔ ورود استاندارد پلتفرم‌هاست (`npm start`). کارها به ترتیب:
 *   ۱) اگر خروجی build نبود، ساخت (node scripts/build-release.mjs --skip-install)
 *   ۲) تولید Prisma Client و آماده‌سازی دیتابیس
 *        prisma/migrations موجود باشد → migrate deploy
 *        نبود                        → db push (پروژهٔ فعلی با db push ساخته شده)
 *        با DB_SETUP=skip|migrate|push می‌تید مسیر را عوض کنید
 *   ۳) اجرای backend/dist/main.js روی $PORT با SERVE_FRONTEND=1 تا SPA را هم سرو کند
 *   ۴) بعد از بالا آمدن سرور، یک prerender سبک برای صفحات سالن‌ها (خلفی)
 *
 * متغیرهای مؤثر: PORT (پیش‌فرض 3100)، HOST، SERVE_FRONTEND، DB_SETUP،
 * SKIP_BUILD، PRERENDER_ON_BOOT، AUTO_SEED (=1 فقط در محیط تازه، برای دموی توسعه)
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const log = (...a) => console.log("•", ...a);
const die = (msg, err) => {
  console.error("❌", msg, err?.message || "");
  process.exit(1);
};

const env = { ...process.env };
const PORT = Number(env.PORT || env.API_PORT || 3100);
const DB_SETUP = (env.DB_SETUP || "auto").toLowerCase();
const SKIP_BUILD = /^(1|true|yes)$/i.test(env.SKIP_BUILD || "");

function fromEnvFile(name) {
  for (const file of [".env.production", ".env"]) {
    const p = join(ROOT, file);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(new RegExp(`^${name}\\s*=\\s*"?(.*?)"?$`, "m"));
    if (m && m[1]) return m[1].trim();
  }
  return undefined;
}
const envValue = (name) => (env[name] || fromEnvFile(name) || "").trim();

const prismaCli = join(ROOT, "node_modules", "prisma", "build", "index.js");
const distMain = join(ROOT, "backend", "dist", "main.js");
const distIndex = join(ROOT, "frontend", "dist", "index.html");

if (!envValue("DATABASE_URL")) {
  console.warn("⚠️  DATABASE_URL تنظیم نشده؛ سرور روی env.ts خطا می‌دهد. از پلتفرم بخواهید آن را set کند.");
}

// ── ۱) build در صورت نبود خروجی ────────────────────────────────────
const needBuild = !SKIP_BUILD && (!existsSync(distMain) || !existsSync(distIndex));
if (needBuild) {
  log("خروجی build نیست — ساخت release...");
  try {
    execFileSync(process.execPath, [join(ROOT, "scripts", "build-release.mjs"), "--skip-install", "--no-smoke"], {
      stdio: "inherit",
      cwd: ROOT,
    });
  } catch {
    die("build-release ناموفق بود");
  }
} else if (SKIP_BUILD) {
  log("SKIP_BUILD=1 — ساخت انجام نشد");
}
if (!existsSync(distMain)) die("backend/dist/main.js وجود ندارد (build را اجرا کنید)");

// ── ۲) Prisma: generate + آماده‌سازی دیتابیس ───────────────────────
if (existsSync(prismaCli)) {
  try {
    execFileSync(process.execPath, [prismaCli, "generate", "--schema", join("prisma", "schema.prisma")], {
      stdio: "inherit",
      cwd: ROOT,
    });
  } catch {
    console.warn("⚠️  prisma generate ناموفق بود (شاید کلاینت از قبل تولید شده باشد)");
  }
}

const hasMigrations = existsSync(join(ROOT, "prisma", "migrations"));
let mode = DB_SETUP;
if (mode === "auto") mode = hasMigrations ? "migrate" : "push";

if (mode !== "skip" && envValue("DATABASE_URL")) {
  const args =
    mode === "migrate"
      ? [prismaCli, "migrate", "deploy", "--schema", join("prisma", "schema.prisma")]
      : [prismaCli, "db", "push", "--skip-generate", "--schema", join("prisma", "schema.prisma")];
  log(`آماده‌سازی دیتابیس (${mode === "migrate" ? "migrate deploy" : "db push"})...`);
  try {
    execFileSync(process.execPath, args, { stdio: "inherit", cwd: ROOT });
  } catch {
    console.error(`⚠️  آماده‌سازی دیتابیس (${mode}) ناموفق بود — سرور باز هم بالا می‌آید و لاگ می‌گیرد.`);
  }
  if (mode === "push" && !hasMigrations) {
    console.warn(
      "ℹ️  پوشهٔ prisma/migrations نیست؛ برای پروداکشنmigration بسازید:  prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script",
    );
  }
} else {
  log(`آماده‌سازی دیتابیس رد شد (DB_SETUP=${mode})`);
}

// ── ۳) اجرای سرور ──────────────────────────────────────────────────
const child = spawn(process.execPath, [distMain], {
  cwd: ROOT, // مهم: public/uploads نسبت به cwd حل می‌شود
  env: { ...env, PORT: String(PORT), HOST: env.HOST || "0.0.0.0", SERVE_FRONTEND: env.SERVE_FRONTEND || "1", NODE_ENV: env.NODE_ENV || "production" },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  console.log(`⏹  سرور با ${signal || "کد " + code} بسته شد.`);
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}

// ── ۴) prerender خلفی بعد از بالا آمدن سرور ────────────────────────
if (/^(0|false|no)$/i.test(env.PRERENDER_ON_BOOT || "")) {
  log("prerender خلفی خاموش (PRERENDER_ON_BOOT=0)");
} else {
  (async () => {
    const base = `http://127.0.0.1:${PORT}`;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2500) });
        if (res.ok) break;
      } catch {
        if (child.exitCode !== null) return;
      }
    }
    if (!existsSync(distIndex)) return;
    log("prerender صفحات سئو (سالن‌ها)...");
    try {
      execFileSync(process.execPath, ["prerender.mjs"], {
        cwd: join(ROOT, "frontend"),
        stdio: "ignore",
        env: { ...env, PRERENDER_API: env.PRERENDER_API || base, VITE_SITE_URL: env.VITE_SITE_URL || env.SITE_URL || base },
      });
      log("prerender انجام شد");
    } catch {
      console.warn("⚠️  prerender کامل نشد (بی‌خطر: صفحات عمومی با shell سرو می‌شوند)");
    }
  })();
}
