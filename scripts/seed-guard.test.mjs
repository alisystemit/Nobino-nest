// تست گارد و پرچم‌های اسکریپت‌های seed (مRFC: یافته‌های CR-3، HI-9، ME-12/13/14 از
// docs/audit-scripts-2026-11-05.md). دو لایه دارد:
//  • اجرایی: هر چهار اسکریپت با `--help`، پرچم ناشناخته و NODE_ENVهای مختلف اجرا
//    می‌شوند — همیشه با DATABASE_URL جعلی، پس هیچ نوشتنی روی دیتابیس واقعی رخ نمی‌دهد.
//  • قرارداد منبع: شرط‌های حذفِ گسترده نباید برگردند.
// اجرا: npm test
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

// پورت ۱ هیچ سرویسی ندارد → PrismaInitializationError و سریع برمی‌گردد
const FAKE_URL = "postgresql://nobino:x@127.0.0.1:1/nobino?schema=public&connect_timeout=2";
const SEEDS = [
  ["prisma/seed.mjs", []],
  ["scripts/seed-demo.mjs", ["--purge-extra-staff"]],
  ["scripts/seed-real.mjs", ["--dry-run", "--clean-only", "--seed-only", "--purge-test-phones"]],
  ["scripts/seed-stress.mjs", ["--clean-settings", "--yes"]],
];

const run = (script, argv, env = {}) =>
  spawnSync(process.execPath, [script, ...argv], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, DATABASE_URL: FAKE_URL, NODE_ENV: "", ALLOW_PROD_SEED: "", ...env },
  });

describe("گارد پروداکشن و پرچم‌های seed", () => {
  for (const [script, flags] of SEEDS) {
    test(`${script}: --help راهنمای هدر را چاپ و با ۰ خارج می‌شود`, () => {
      const r = run(script, ["--help"]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /اجرا:/);
    });

    test(`${script}: پرچم ناشناخته رد می‌شود (ME-14)`, () => {
      const r = run(script, ["--dryrun"]);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /پرچم ناشناخته/);
    });

    test(`${script}: پرچم‌های مجاز پذیرفته می‌شوند`, () => {
      if (!flags.length) return;
      const r = run(script, [flags[0]]);
      assert.doesNotMatch(r.stderr, /پرچم ناشناخته/, `${flags[0]} باید مجاز باشد`);
    });

    for (const env of ["Production", "PRODUCTION", "production ", "production"]) {
      test(`${script}: NODE_ENV=${JSON.stringify(env)} بدون ALLOW_PROD_SEED متوقف می‌شود (ME-12)`, () => {
        const r = run(script, [], { NODE_ENV: env });
        assert.equal(r.status, 1);
        assert.match(r.stderr, /روی production اجرا نمی‌شود/);
      });
    }

    test(`${script}: NODE_ENV=production با ALLOW_PROD_SEED=true رد نمی‌شود (ME-13)`, () => {
      const r = run(script, [], { NODE_ENV: "production", ALLOW_PROD_SEED: "true" });
      assert.doesNotMatch(r.stderr, /روی production اجرا نمی‌شود/);
      assert.equal(r.status, 1, "با DATABASE_URL جعلی باید به خطای اتصال بخورد، نه صفر");
    });

    test(`${script}: PrismaClient بعد از گارد ساخته می‌شود (ME-13)`, () => {
      const src = read(script);
      const guard = src.indexOf("seedGuard(");
      const client = src.indexOf("new PrismaClient()");
      assert.ok(guard >= 0, "باید از گارد مشترک استفاده کند");
      assert.ok(client > guard, "ساخت کلاینت باید بعد از گارد باشد");
    });
  }

  test("گارد NODE_ENV را از .env ریشه هم می‌خواند (ME-13)", () => {
    // شل ممکن است NODE_ENV را ست نکرده باشد و Prisma آن را lazy بار کند؛
    // گارد باید خودش .env را بخواند، وگرنه روی سرور از کار می‌افتد.
    assert.match(read("scripts", "lib", "seed-guard.mjs"), /function resolveNodeEnv\(\)/);
    assert.match(read("scripts", "lib", "seed-guard.mjs"), /readFileSync\(ROOT_ENV/);
  });
});

describe("شرط‌های حذف seed نباید دادهٔ واقعی را بَرَد (CR-3)", () => {
  const real = read("scripts", "seed-real.mjs");

  test("حذف‌های «بر پایهٔ حدس» پشت پرچم --purge-test-phones هستند", () => {
    for (const dead of [
      'recipient: { startsWith: "099" }',
      'actorPhone: { startsWith: "099" }',
      'code: { contains: "stress", mode: "insensitive" }',
      'email: { contains: "stress" }',
      'name: { contains: "استرس" }',
    ]) {
      assert.ok(!real.includes(dead), `باید حذف شده باشد: ${dead}`);
    }
    assert.match(real, /const PURGE_HINTS = has\("--purge-test-phones"\)/);
    assert.match(real, /PURGE_HINTS[\s\S]{0,120}startsWith: "0999"/);
    assert.match(real, /if \(PURGE_HINTS\) discOr\.push\(\{ code: \{ startsWith: "WELCOME" \} \}\)/);
    assert.match(real, /slug: \{ startsWith: "stress-" \}/);
    assert.match(real, /name: \{ startsWith: "سالن استرس" \}/);
  });

  test("پاک‌سازی کهنهٔ کیف‌پول فقط ردیف‌های خودش (nr) را می‌بیند", () => {
    assert.doesNotMatch(real, /deleteMany\(\{ where: \{ ownerId: \{ in: R\.wallets/);
    assert.match(real, /w\.ownerId\.startsWith\("nr"\)/);
    assert.match(real, /مالکِ از پیش موجود کیف‌پول دارد/);
  });

  test("seed-demo حذف پرسنل را با --purge-extra-staff گیت می‌کند", () => {
    const demo = read("scripts", "seed-demo.mjs");
    assert.match(demo, /const PURGE_EXTRA_STAFF = has\("--purge-extra-staff"\)/);
    assert.match(demo, /if \(PURGE_EXTRA_STAFF\)[\s\S]{0,240}staff\.deleteMany/);
    assert.match(demo, /پرسنلِ اضافه نگه داشته شد/);
  });

  test("seed-stress بدون --yes چیزی حذف نمی‌کند (HI-9)", () => {
    const stress = read("scripts", "seed-stress.mjs");
    assert.match(stress, /if \(!YES\)[\s\S]{0,400}process\.exitCode = 1[\s\S]{0,200}\}[\s\S]{0,160}setting\.deleteMany/);
  });

  test("seed:real در package.json ورودی دارد (HG-3)", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.equal(pkg.scripts["seed:real"], "node scripts/seed-real.mjs");
    assert.equal(pkg.scripts["seed:real:dry"], "node scripts/seed-real.mjs --dry-run");
  });
});
