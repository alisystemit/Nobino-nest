/**
 * تست‌های backend/scripts/gen-controllers.mjs (ME-10، LO-5) و
 * بازنشستگی port-routes.mjs / port-pages.mjs — همه در سندباکسِ موقت؛
 * مانیفست واقعی مخزن هرگز لمس نمی‌شود.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEN = readFileSync(join(ROOT, "backend", "scripts", "gen-controllers.mjs"), "utf8");
const MARK = "تولیدشده توسط backend/scripts/gen-controllers.mjs";

const CRON_ALL = ["reminders", "notifications", "waitlist", "holds", "subscriptions"].map((n) => ({
  path: `cron/${n}`,
  url: `/api/cron/${n}`,
  module: `@/routes/api/cron__${n}`,
  methods: ["GET"],
}));

function sandbox(manifestEntries) {
  const dir = mkdtempSync(join(tmpdir(), "nobino-gen-"));
  const backend = join(dir, "backend");
  mkdirSync(join(backend, "scripts"), { recursive: true });
  mkdirSync(join(backend, "src", "routes"), { recursive: true });
  writeFileSync(join(backend, "scripts", "gen-controllers.mjs"), GEN);
  writeFileSync(join(backend, "src", "routes", "manifest.json"), JSON.stringify(manifestEntries, null, 2));
  return dir;
}

function runGen(dir, args = []) {
  return spawnSync(process.execPath, [join(dir, "backend", "scripts", "gen-controllers.mjs"), ...args], {
    encoding: "utf8",
  });
}

test("gen-controllers: تولید عادی + هشدار/حذف بی‌یتیم با --prune", () => {
  const dir = sandbox([
    { path: "auth/login", url: "/api/auth/login", module: "@/routes/api/auth__login", methods: ["POST"] },
    { path: "auth/logout", url: "/api/auth/logout", module: "@/routes/api/auth__logout", methods: ["POST"] },
    ...CRON_ALL,
  ]);
  const controllers = join(dir, "backend", "src", "controllers");

  // ۱) اجرای عادی: auth ساخته می‌شود
  let r = runGen(dir);
  assert.equal(r.status, 0, r.stderr);
  const authFile = join(controllers, "auth.controller.ts");
  assert.ok(readFileSync(authFile, "utf8").includes('@Post("/api/auth/login")'));

  // ۲) بی‌یتیم: auth.controller.ts باقی می‌ماند ولی مانیفست دیگر auth ندارد → هشدار، بدون حذف
  writeFileSync(
    join(dir, "backend", "src", "routes", "manifest.json"),
    JSON.stringify([{ path: "public/x", url: "/api/public/x", module: "@/routes/api/public__x", methods: ["GET"] }, ...CRON_ALL]),
  );
  r = runGen(dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /کنترلر بی‌یتیم/);
  assert.ok(existsSync(authFile), "پیش‌فرض نباید حذف کند");

  // ۳) --prune حذف می‌کند
  r = runGen(dir, ["--prune"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /حذف شد/);
  assert.ok(!existsSync(authFile), "--prune باید فایل بی‌یتیم را حذف کند");

  // ۴) فایل دستی (بدون علامت «خودکار») هرگز حذف نمی‌شود
  mkdirSync(controllers, { recursive: true });
  writeFileSync(join(controllers, "pages.controller.ts"), "// دستی\n");
  r = runGen(dir, ["--prune"]);
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(controllers, "pages.controller.ts")));

  rmSync(dir, { recursive: true, force: true });
});

test("gen-controllers: کرانِ بدون ددلاین و ددلاینِ بدون کران → خروج ۱ با پیام (LO-5)", () => {
  const dir = sandbox([
    { path: "cron/newjob", url: "/api/cron/newjob", module: "@/routes/api/cron__newjob", methods: ["GET"] },
  ]);
  const r = runGen(dir);
  assert.equal(r.status, 1, "کران بی‌ددلاین باید تولیدکد را با خطا متوقف کند");
  assert.match(r.stderr, /cron\/newjob/);
  assert.match(r.stderr, /cron\/reminders/, "ددلاین‌های بدون مسیرِ مانیفست هم باید خطا شوند");

  // بدون هیچ cron در مانیفست: هر ۵ ددلاین مرده‌اند
  writeFileSync(
    join(dir, "backend", "src", "routes", "manifest.json"),
    JSON.stringify([{ path: "public/x", url: "/api/public/x", module: "@/routes/api/public__x", methods: ["GET"] }]),
  );
  const r2 = runGen(dir);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /کران مرده/);

  // مانیفست سالم (هر ۵ کران) → خروج ۰ و هر ۵ @Cron در سرویس
  writeFileSync(join(dir, "backend", "src", "routes", "manifest.json"), JSON.stringify(CRON_ALL));
  const r3 = runGen(dir);
  assert.equal(r3.status, 0, r3.stderr);
  const svc = readFileSync(join(dir, "backend", "src", "cron", "cron-jobs.service.ts"), "utf8");
  assert.equal((svc.match(/@Cron\(/g) || []).length, 5);
  assert.match(svc, /در CRON_JOBS نیست/, "fire() باید برای مسیر ناموجود پیام خطا بدهد");
  assert.ok(!svc.includes('if (!job) return;'), "fire() نباید بی‌صدا برگردد");

  rmSync(dir, { recursive: true, force: true });
});

test("gen-controllers: --help و پرچم ناشناخته", () => {
  const dir = sandbox([]);
  let r = runGen(dir, ["--help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--prune/);
  r = runGen(dir, ["--wat"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /ناشناخته/);
  rmSync(dir, { recursive: true, force: true });
});

test("port-routes / port-pages بازنشسته‌اند و مانیفست را دست نمی‌زنند (ME-10)", () => {
  const manifest = join(ROOT, "backend", "src", "routes", "manifest.json");
  const before = statSync(manifest).mtimeMs;
  const hash = readFileSync(manifest, "utf8").length;

  for (const script of ["backend/scripts/port-routes.mjs", "frontend/scripts/port-pages.mjs"]) {
    const r = spawnSync(process.execPath, [join(ROOT, script)], { encoding: "utf8" });
    assert.equal(r.status, 1, `${script} باید با خطا و بدون نوشتن خارج شود`);
    assert.match(r.stderr, /بازنشسته/);
  }

  assert.equal(statSync(manifest).mtimeMs, before, "manifest.json نباید لمس شود");
  assert.equal(readFileSync(manifest, "utf8").length, hash, "manifest.json نباید تغییر کند");
});

test("قرارداد منبع: ساختارهای کلیدی gen-controllers", () => {
  const src = GEN;
  assert.match(src, /const CRON_SCHEDULES = \{/, "ددلاین‌ها باید در یک نقشهٔ واحد باشند");
  assert.match(src, /process\.exitCode = 1/, "خطای کران باید کد خروج را ۱ کند");
  assert.match(src, /GENERATED_MARK/, "علامت فایل‌های تولیدشده باید ثابت باشد");
  assert.match(src, /--prune/, "پرچم پاک‌سازی بی‌یتیم باید مستند شود");
  assert.doesNotMatch(src, /if \(!job\) return;/, "fire() نباید مسیر ناموجود را بی‌صدا نادیده بگیرد");
});
