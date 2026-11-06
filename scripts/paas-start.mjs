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
 * SKIP_BUILD، PRERENDER_ON_BOOT،
 * AUTO_SEED=1 → اجرای prisma/seed.mjs (بذر دیمو). روی production بی‌اثر است
 * مگر ALLOW_PROD_SEED=1، چون seed کاربر ادمین با رمز پیش‌فرض معلوم می‌سازد.
 */
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
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

// db push در هر بوت، هر بار schema دیتابیس را دست‌کاری می‌کند. چون این مخزن
// migration ندارد، مسیر درست همین است؛ پس فقط وقتی تکرار می‌شود که
// schema.prisma از آخرین push موفق تغییر کرده باشد.
const SCHEMA_FILE = join(ROOT, "prisma", "schema.prisma");
const SCHEMA_STAMP = join(ROOT, "node_modules", ".cache", "nobino-schema-stamp");
function schemaChanged() {
  try {
    const hash = createHash("sha256").update(readFileSync(SCHEMA_FILE)).digest("hex");
    const last = existsSync(SCHEMA_STAMP) ? readFileSync(SCHEMA_STAMP, "utf8").trim() : "";
    return { hash, changed: last !== hash };
  } catch {
    return { hash: "", changed: true };
  }
}

if (mode !== "skip" && envValue("DATABASE_URL")) {
  const stamp = mode === "push" ? schemaChanged() : { changed: true, hash: "" };
  if (mode === "push" && !stamp.changed) {
    log("db push رد شد — schema.prisma از آخرین آماده‌سازی تغییر نکرده است (DB_SETUP=push برای اجرا اجباری)");
  } else {
    const args =
      mode === "migrate"
        ? [prismaCli, "migrate", "deploy", "--schema", join("prisma", "schema.prisma")]
        : [prismaCli, "db", "push", "--skip-generate", "--schema", join("prisma", "schema.prisma")];
    log(`آماده‌سازی دیتابیس (${mode === "migrate" ? "migrate deploy" : "db push"})...`);
    // ME-8: زیر PM2/داکر stdin تTY نیست و با `stdio:"inherit"` پرامپت تخریبیِ
    // `db push` (حذف ستون/جدول) می‌تواند بوت را معلق کند. stdin را ignore می‌دهیم
    // تا EOF بگیرد و پریزما همان لحظه خطا بدهد؛ `--accept-data-loss` هرگز اضافه
    // نمی‌شود، چون حذف بی‌سرویس داده در بوت خودکار قابل قبول نیست.
    const interactive = Boolean(process.stdin.isTTY);
    try {
      execFileSync(process.execPath, args, {
        stdio: interactive ? "inherit" : ["ignore", "inherit", "inherit"],
        cwd: ROOT,
      });
      if (mode === "push" && stamp.hash) {
        try {
          mkdirSync(dirname(SCHEMA_STAMP), { recursive: true });
          writeFileSync(SCHEMA_STAMP, stamp.hash, "utf8");
        } catch {
          console.warn("⚠️  مُهر schema نوشته نشد — در بوت بعدی دوباره db push اجرا می‌شود.");
        }
      }
    } catch {
      console.error(`❌ آماده‌سازی دیتابیس (${mode}) ناموفق بود — سرور بالا می‌آید ولی اسکیما به‌روز نیست.`);
      if (mode === "migrate") {
        console.error(
          "    اگر این دیتابیس قبلاً با db push ساخته شده، یک‌بار baseline را علامت بزنید:\n" +
            `    node ${prismaCli} migrate resolve --applied 0_init --schema prisma/schema.prisma`,
        );
      } else {
        console.error(
          "    اگر پریزما روی حذف ستون/جدول اخطار داده، آگاهانه و دستی تصمیم بگیرید:\n" +
            `    node ${prismaCli} db push --schema prisma/schema.prisma   (با --accept-data-loss فقط پس از بکاپ)`,
        );
      }
    }
  }
  if (mode === "migrate" && !hasMigrations) {
    console.warn("ℹ️  پوشهٔ prisma/migrations نیست؛ baseline بسازید (راهنما: prisma/migrations/README.md).");
  }
} else {
  log(`آماده‌سازی دیتابیس رد شد (DB_SETUP=${mode})`);
}

// ── ۲.۵) بذر دیمو — فقط محیط توسعهٔ تازه ────────────────────────────
// seed.mjs کاربر ادمین با رمز پیش‌فرض معلوم می‌سازد، پس روی production
// بدون ALLOW_PROD_SEED=1 اجرا نمی‌شود.
if (/^(1|true|yes)$/i.test(envValue("AUTO_SEED"))) {
  const isProd = (envValue("NODE_ENV") || "production").toLowerCase() === "production";
  const allowed = !isProd || /^(1|true|yes)$/i.test(envValue("ALLOW_PROD_SEED"));
  if (!allowed) {
    console.warn("⚠️  AUTO_SEED در production رد شد (ادمین پیش‌فرض با رمز معلوم) — برای اطمینان ALLOW_PROD_SEED=1.");
  } else {
    const seedScript = join(ROOT, "prisma", "seed.mjs");
    if (existsSync(seedScript)) {
      log("AUTO_SEED=1 — اجرای prisma/seed.mjs");
      try {
        execFileSync(process.execPath, [seedScript], { stdio: "inherit", cwd: ROOT });
      } catch {
        console.warn("⚠️  seed ناموفق بود");
      }
    }
  }
}

// ── ۳) اجرای سرور ──────────────────────────────────────────────────
const child = spawn(process.execPath, [distMain], {
  cwd: ROOT, // مهم: public/uploads نسبت به cwd حل می‌شود
  env: { ...env, PORT: String(PORT), HOST: env.HOST || "0.0.0.0", SERVE_FRONTEND: env.SERVE_FRONTEND || "1", NODE_ENV: env.NODE_ENV || "production" },
  stdio: "inherit",
});

let requestedStop = false;
child.on("exit", (code, signal) => {
  if (signal) {
    console.log(`⏹  سرور با سیگنال ${signal} بسته شد (${requestedStop ? "توقف درخواستی" : "غیردرخواستی"}).`);
    // سیگنال غیردرخواستی (OOM، کرش) نباید مثل توقف تمیز با کد ۰ دیده شود
    process.exit(requestedStop ? 0 : 1);
  }
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    requestedStop = true;
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
    // مبنای سئو از محیط یا فایل .env خوانده می‌شود؛ آدرس لوکالِ خودِ سرور
    // هرگز جانشین دامنه نمی‌شود (در آن حالت prerender sitemap/robots را پاک می‌کند).
    const site = envValue("VITE_SITE_URL") || envValue("SITE_URL") || envValue("VITE_APP_URL") || envValue("APP_URL");
    if (!site) {
      console.warn("⚠️  مبنای سئو مشخص نیست (VITE_SITE_URL/SITE_URL در env یا .env) — prerender انجام نشد تا sitemap/robots کهنه یا لوکال نوشته نشود.");
      return;
    }
    log("prerender صفحات سئو (سالن‌ها)...");
    // ME-11: هر دو stream را می‌گیریم و چاپ می‌کنیم — با stdio:"ignore" هشدارها
    // (و «۰ صفحه سالن») در لاگ PM2 هرگز دیده نمی‌شدند.
    const r = spawnSync(process.execPath, ["prerender.mjs"], {
      cwd: join(ROOT, "frontend"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...env, PRERENDER_API: env.PRERENDER_API || base, VITE_SITE_URL: site },
    });
    const lines = `${r.stdout || ""}\n${r.stderr || ""}`.split(/\r?\n/).filter((l) => /prerender/.test(l));
    for (const line of lines) (r.status === 0 ? log : console.warn)("   " + line);
    if (r.status === 0) log("prerender انجام شد");
    else if (r.error) console.warn(`⚠️  prerender اجرا نشد: ${r.error.message}`);
    else console.warn("⚠️  prerender کامل نشد — بک‌اند دادهٔ سئو نداد (صفحات سالن ساخته نشدند).");
  })();
}
