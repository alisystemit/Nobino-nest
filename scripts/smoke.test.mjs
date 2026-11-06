// تست دود (smoke) + تست واحدِ منطقِ بک‌اند
//  • بخش اول: تابع‌های خالصِ backend/dist/lib (بدون سرور و دیتابیس)
//  • بخش دوم: بالا آوردن backend/dist/main.js روی پورت تصادفی و زدن به نوک‌های API
// اجرا: npm test   |   اگر بیلد بک‌اند نباشد بخش دوم skip می‌شود (نه fail).
// برای بیلد: npm run build:backend   (بخش HTTP به backend/dist/main.js نیاز دارد)
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { request as rawRequest } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { requireArtifact } from "./lib/test-guard.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..");
const DIST_MAIN = join(ROOT, "backend", "dist", "main.js");
const DIST_INDEX = join(ROOT, "frontend", "dist", "index.html");

const lib = (rel) => require(join(ROOT, "backend", "dist", "lib", rel));
const dist = (rel) => require(join(ROOT, "backend", "dist", rel));

// ───────────────────────── منطق خالص (نیازمند فقط بیلد بک‌اند) ─────────────────────────
const distReady = existsSync(DIST_MAIN);
// ME-9: نبودِ بیلد با skip بی‌صدا «سبز» نیست — شکست می‌خورد مگر SKIP_MISSING_ARTIFACTS=1
const skipIfNoBuild = (t) => !requireArtifact(t, DIST_MAIN, "npm run build:backend");

test("رمز عبور: هش scrypt و راستی‌آزمایی دوسویه", async (t) => {
  if (skipIfNoBuild(t)) return;
  const P = lib("auth/password.js");
  const hash = await P.hashPassword("Admin@1234");
  assert.match(hash, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/, "قالب هش باید scrypt:salt:hex باشد");
  assert.equal(await P.verifyPassword("Admin@1234", hash), true);
  assert.equal(await P.verifyPassword("admin@1234", hash), false, "حساس به بزرگی/کوچکی حرف باید باشد");
  assert.notEqual(await P.hashPassword("Admin@1234"), hash, "هر بار salt تازه لازم است");
});

test("رمز عبور: کوتاه‌ترین طول مجاز و پیام فارسی", (t) => {
  if (skipIfNoBuild(t)) return;
  const P = lib("auth/password.js");
  assert.equal(P.PASSWORD_MIN, 8);
  assert.match(String(P.passwordIssue("abc")), /حداقل/);
  assert.equal(P.passwordIssue("Admin@1234"), null);
});

test("منطق منطقهٔ زمانی: نیمه‌شب محلی و اجزای روز", (t) => {
  if (skipIfNoBuild(t)) return;
  const T = lib("timezone.js");
  assert.equal(T.tzOffsetMinutes("Asia/Tehran", new Date("2026-07-01T00:00:00Z")), 210, "تهران +۳:۳۰");
  assert.equal(T.localMidnightUTC("2026-11-04", "Asia/Tehran").toISOString(), "2026-11-03T20:30:00.000Z");
  const parts = T.localParts(new Date("2026-01-01T21:00:00Z"), "Asia/Tehran");
  assert.equal(parts.dayISO, "2026-01-02", "۰۰:۳۰ روز بعد به وقت تهران");
  assert.equal(parts.minutes, 30);
});

test("تعریف سقف پلن‌ها: کلید تنظیم، قالب فارسی و ارقام", (t) => {
  if (skipIfNoBuild(t)) return;
  const L = lib("plans/limit-defs.js");
  assert.ok(L.LIMIT_DEFS.length > 0, "LIMIT_DEFS خالی است");
  const staff = L.findLimitDef("staff");
  assert.ok(staff, "تعریف سقف کارکنان پیدا نشد");
  assert.equal(L.limitSettingKey("PRO", "staff"), "plan.limit.PRO.staff", "قالب کلید: plan.limit.<PLAN>.<key>");
  assert.equal(L.faDigits("1234"), "۱۲۳۴", "ارقام فنی باید به فارسی تبدیل شوند");
  assert.equal(L.formatLimit(staff, 3), "تا ۳ کارمند");
  assert.match(L.formatLimit(staff, L.UNLIMITED_FROM), /نامحدود/, "سقف نامحدود باید متن «نامحدود» داشته باشد");
  const keys = L.LIMIT_DEFS.map((d) => d.key);
  assert.equal(new Set(keys).size, keys.length, "کلید سقف تکراری در LIMIT_DEFS وجود دارد");
  for (const d of L.LIMIT_DEFS) assert.ok(d.label && /\S/.test(d.label), `${d.key}: برچسب فارسی ندارد`);
});

test("سقف آپلود: پیش‌فرض‌ها، نگاشت بایت→مگابایت و پیام فارسی", (t) => {
  if (skipIfNoBuild(t)) return;
  const U = lib("upload-limits.js");
  assert.deepEqual(U.uploadLimitsPayload({ avatarMaxBytes: 3 * 1024 * 1024, imageMaxBytes: 5 * 1024 * 1024, voiceMaxBytes: 3 * 1024 * 1024 }), {
    avatarMaxMb: 3,
    imageMaxMb: 5,
    voiceMaxMb: 3,
  });
  assert.match(U.sizeLimitFa(3), /۳/);
  assert.equal(U.UPLOAD_DEFAULTS.avatarMaxMb, 3);
});

test("اعتبارسنجی آپلود: تشخیص magic bytes و پسوند امن", (t) => {
  if (skipIfNoBuild(t)) return;
  const V = lib("upload-validation.js");
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
  assert.equal(V.sniffImageMime(png), "image/png");
  assert.equal(V.sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(V.sniffImageMime(Buffer.from("GIF89a....", "latin1")), "image/gif");
  assert.equal(V.sniffImageMime(Buffer.from("RIFF....WEBP", "latin1")), "image/webp");
  assert.equal(V.sniffImageMime(Buffer.from("<svg onload=alert(1)>")), null, "SVG/HTML نباید تصویر شناخته شود");
  assert.equal(V.sniffAudioMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])), "audio/webm");
  assert.equal(V.sniffAudioMime(Buffer.from("OggS....", "latin1")), "audio/ogg");

  assert.equal(V.mimeForExtension(".png"), "image/png");
  assert.equal(V.mimeForExtension(".html"), null, "HTML نباید از مسیر آپلود سرو شود");
  assert.equal(V.mimeForExtension(".svg"), null, "SVG نباید از مسیر آپلود سرو شود");
  assert.equal(V.mimeForExtension(".bin"), null, "پسوند ناشناخته نباید سرو شود");

  assert.equal(V.safeUploadName("../../etc/passwd", "audio/webm"), "passwd", "مسیر از نام حذف می‌شود");
  assert.equal(V.safeUploadName("", "audio/webm"), "upload.webm", "نام خالی با پسوند MIME جایگزین می‌شود");
});

test("پول: سقف Int، عدد صحیح و پیام فارسی", (t) => {
  if (skipIfNoBuild(t)) return;
  const M = lib("money.js");
  assert.equal(M.MONEY_INT_MAX, 2_147_483_647);
  assert.equal(M.moneyIssue(1_000), null);
  assert.equal(M.moneyIssue(0), null);
  assert.equal(M.moneyIssue(-5), null, "مبلغ منفی برای اصلاحات مجاز است");
  assert.match(M.moneyIssue(1.5), /صحیح/);
  assert.match(M.moneyIssue(NaN), /معتبر/);
  assert.match(M.moneyIssue(M.MONEY_INT_MAX + 1), /بیشتر/);
  assert.throws(() => M.assertMoney(M.MONEY_INT_MAX + 1), /بیشتر/);
  assert.throws(() => M.assertPositiveMoney(0), /بزرگ‌تر از صفر/);
  assert.equal(M.assertPositiveMoney(50_000), 50_000);
});

test("پول: تبدیل امن BigInt ↔ number و قرارداد اسکیما", (t) => {
  if (skipIfNoBuild(t)) return;
  const M = lib("money.js");

  assert.equal(M.asNumber(50_000n), 50_000);
  assert.equal(M.asNumber(7), 7);
  assert.equal(M.asNumberOrNull(null), null);
  assert.equal(M.asNumberOrNull(0n), 0);
  assert.equal(M.asBigInt(50_000), 50_000n);
  assert.equal(M.asBigInt(50_000n), 50_000n);
  assert.equal(M.asBigIntOrNull(undefined), null);
  assert.throws(() => M.asBigInt(1.5), /صحیح/);
  assert.throws(() => M.asNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n), /محدوده/);

  // قرارداد پایگاه‌داده: ستون‌های مالی باید BIGINT باشند (نه Int)
  const schema = readFileSync(join(ROOT, "prisma", "schema.prisma"), "utf8");
  const model = (name) => {
    const re = new RegExp("model " + name + " \\{[\\s\\S]*?\\n\\}");
    const hit = schema.match(re);
    assert.ok(hit, `مدل ${name} در اسکیما پیدا نشد`);
    return hit[0];
  };
  for (const [name, fields] of Object.entries({
    Wallet: ["balance"],
    Transaction: ["amount", "balanceAfter"],
    Payment: ["amount"],
    Order: ["amount", "originalAmount"],
    Invoice: ["amount", "originalAmount"],
    Package: ["price", "yearlyPrice"],
    Service: ["price"],
    Appointment: ["depositAmount", "priceSnapshot"],
    Payout: ["amount"],
    GiftCard: ["balance"],
  })) {
    for (const field of fields) {
      assert.match(model(name), new RegExp(field + "\\s+BigInt"), `${name}.${field} باید BigInt باشد`);
    }
  }
  assert.match(model("Order"), /renewalSubscriptionId\s+String\?/, "سفارش تمدید باید به اشتراک موجود پیوند داشته باشد");

  const migration = readFileSync(
    join(ROOT, "prisma", "migrations", "20261106130000_money_bigint_and_renewal", "migration.sql"),
    "utf8",
  );
  assert.match(migration, /ALTER TABLE "public"\."Wallet" ALTER COLUMN "balance" TYPE BIGINT/);
  assert.match(migration, /ALTER TABLE "public"\."Payment" ALTER COLUMN "amount" TYPE BIGINT/);
  assert.match(migration, /ADD COLUMN "renewalSubscriptionId"/);
});

test("سقف بدنه: مسیرهای آپلود سقف بزرگ‌تر و پیام فارسی", (t) => {
  if (skipIfNoBuild(t)) return;
  const B = dist("common/body-limit.js");
  assert.ok(B.uploadBodyLimit() > B.jsonBodyLimit(), "سقف آپلود باید از سقف JSON بیشتر باشد");
  assert.equal(B.bodyLimitForPath("/api/upload/avatar"), B.uploadBodyLimit());
  assert.equal(B.bodyLimitForPath("/api/voice/transcribe"), B.uploadBodyLimit());
  assert.equal(B.bodyLimitForPath("/api/appointments"), B.jsonBodyLimit(), "مسیرهای عادی سقف کوچک دارند");
  assert.match(B.bodyLimitMessage(2 * 1024 * 1024), /مگابایت/);
  assert.equal(B.declaredBodyExceeds(String(3 * 1024 * 1024), B.jsonBodyLimit()), true);
  assert.equal(B.declaredBodyExceeds(undefined, 1024), false, "بدون هدر، لایهٔ استریم تصمیم می‌گیرد");
});

test("سقف CRM: payload مگابایتی و پیش‌فرض‌های عددی", (t) => {
  if (skipIfNoBuild(t)) return;
  const C = lib("crm-limits.js");
  const p = C.crmLimitsPayload({ noteLimit: 5, mediaLimit: 10, photoMaxBytes: 5 * 1024 * 1024, voiceMaxBytes: 10 * 1024 * 1024, mediaEnabled: true });
  assert.deepEqual(p, { noteLimit: 5, mediaLimit: 10, photoMaxMb: 5, voiceMaxMb: 10, mediaEnabled: true });
});

test("نامک سالن: اعتبارسنجی و تولید از نام فارسی", (t) => {
  if (skipIfNoBuild(t)) return;
  const S = lib("slug.js");
  assert.equal(S.isSlugValid("mah"), true);
  assert.equal(S.isSlugValid("Mah"), true, "اعتبارسنجی قبل از بررسی یکدست‌سازی می‌کند");
  assert.equal(S.isSlugValid("  mah "), true, "فضای دور نادیده گرفته می‌شود");
  assert.equal(S.isSlugValid("a b"), false, "فاصلهٔ میانی مجاز نیست");
  assert.equal(S.isSlugValid("m"), false, "نامک تک‌حرفی پذیرفته نمی‌شود");
  const cands = S.slugCandidates("سالن زیبایی ماه");
  assert.ok(Array.isArray(cands) && cands.length > 0, "برای نام فارسی باید نامک پیشنهادی تولید شود");
  assert.equal(cands[0], "sln-zibii-mh", "نامک اول از ترنزلیتریشن نام می‌آید");
  for (const c of cands) assert.equal(S.isSlugValid(c), true, `نامک پیشنهادی نامعتبر: ${c}`);
});

test("نشانی سالن: ساب‌دامین محلی، /s/<slug> و میزبان خودِ سالن", (t) => {
  if (skipIfNoBuild(t)) return;
  const U = lib("salon-url.js");
  assert.deepEqual(U.parseOrigin("https://mah.nobino.app"), { proto: "https:", hostname: "mah.nobino.app", port: "" });
  assert.equal(U.parseOrigin("not a url"), null, "ورودی نامعتبر باید null برگرداند");
  assert.equal(U.subdomainMode("http://mah.localhost:5175"), true, "localhost در حالت ساب‌دامین کار می‌کند");
  assert.equal(U.salonUrlFromOrigin("mah", "http://mah.localhost:5175"), "http://mah.localhost:5175");
  assert.equal(U.salonUrlFromOrigin("mah", "https://nobino.app"), "https://nobino.app/s/mah", "بدون ساب‌دامین به مسیر /s/<slug> برمی‌گردد");
  assert.equal(U.isSalonOwnHost({ slug: "mah" }, "mah.localhost:5175"), true, "ساب‌دامینِ نامک = میزبان خودِ سالن");
  assert.equal(U.isSalonOwnHost({ slug: "mah" }, "localhost:5175"), false, "میزبان ریشه، میزبان خودِ سالن نیست");
  assert.equal(U.isSalonOwnHost({ slug: "mah", customDomain: "mah.style", domainStatus: "VERIFIED" }, "mah.style"), true);
  assert.equal(U.isSalonOwnHost({ slug: "mah", customDomain: "mah.style", domainStatus: "PENDING" }, "mah.style"), false, "دامنهٔ تأییدنشده میزبان حساب نشود");
});

test("اوریجین نمایشی: میزبانِ درخواست با پورت حفظ می‌شود و هدر جعلی رد می‌شود", (t) => {
  if (skipIfNoBuild(t)) return;
  const SO = lib("site-origin.js");
  const RC = dist("compat/request-context.js");
  const U = lib("salon-url.js");
  const withRequest = (url, fn) => RC.requestStore.run({ request: new Request(url) }, fn);
  const saved = { ROOT_DOMAIN: process.env.ROOT_DOMAIN, SITE_URL: process.env.SITE_URL, APP_URL: process.env.APP_URL };
  process.env.ROOT_DOMAIN = "localhost";
  process.env.SITE_URL = "http://localhost:5175";
  delete process.env.APP_URL;
  try {
    // لوکال: پورتِ میزبان باید بماند — همان چیزی که روی :3100 نشانی‌ها را درست می‌کند
    assert.equal(withRequest("http://mah.localhost:3100/api/x", () => SO.requestOriginOrNull()), "http://mah.localhost:3100");
    assert.equal(withRequest("http://127.0.0.1:3100/api/x", () => SO.requestOriginOrNull()), "http://127.0.0.1:3100");
    assert.equal(
      withRequest("http://localhost:3100/api/x", () => U.salonPublicUrl({ slug: "mah" })),
      "http://mah.localhost:3100",
      "نشانی سالن از میزبانِ درخواست ساخته می‌شود، نه SITE_URL"
    );
    assert.equal(
      withRequest("http://mah.localhost:3100/api/x", () => U.salonPublicUrl({ slug: "mah" })),
      "http://mah.localhost:3100",
      "اگر روی ساب‌دامین خودِ سالن باشیم mah.mah ساخته نمی‌شود"
    );
    // میزبان متفرقهٔ هدر Host پذیرفته نمی‌شود و به SITE_URL برمی‌گردد
    assert.equal(withRequest("http://evil.example.com/api/x", () => SO.requestOriginOrNull()), null, "هاست جعلی نباید بپذیرد");
    assert.equal(SO.requestOriginOrNull(), null, "بیرون از درخواست null است");
    assert.equal(SO.publicOrigin(), "http://localhost:5175", "در نبودِ درخواست، SITE_URL");
    assert.equal(U.salonPublicUrl({ slug: "mah", customDomain: "mah.style", domainStatus: "VERIFIED" }), "https://mah.style", "دامنهٔ اختصاصی دست‌نخورده");
    // دامنهٔ واقعی: زیرِ ROOT_domain قبول، بیرون از آن رد
    process.env.ROOT_DOMAIN = "nobino.ir";
    assert.equal(withRequest("https://mah.nobino.ir/api/x", () => SO.requestOriginOrNull()), "https://mah.nobino.ir");
    assert.equal(withRequest("https://evil.test/api/x", () => SO.requestOriginOrNull()), null);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("تقویم جلالی: رفت و برگشت و قالب فارسی", (t) => {
  if (skipIfNoBuild(t)) return;
  const J = lib("time/jalali.js");
  assert.deepEqual(J.gregorianToJalali(2026, 11, 4), { jy: 1405, jm: 8, jd: 13 });
  assert.deepEqual(J.isoToJalali("2026-11-04"), { jy: 1405, jm: 8, jd: 13 });
  assert.equal(J.jalaliToIso(1405, 8, 13), "2026-11-04", "رفت و برگشت باید بسته باشد");
  assert.equal(J.formatJalali("2026-11-04"), "۱۳ آبان ۱۴۰۵");
  assert.match(J.formatJalaliWithWeekday("2026-11-04"), /چهارشنبه/);
  assert.equal(J.jalaliMonthDays(1403, 1), 31, "فروردین ۳۱ روز است");
  assert.equal(J.toPersianDigits("1404/08/13"), "۱۴۰۴/۰۸/۱۳");
  assert.equal(J.toLatinDigits(J.toPersianDigits("1404")), "1404");
  assert.equal(J.JALALI_MONTHS.length, 12);
});

test("پنجرهٔ روز: پارامتر روز، جابه‌جایی، اختلاف و برچسب فارسی", (t) => {
  if (skipIfNoBuild(t)) return;
  const D = lib("time/day-window.js");
  assert.equal(D.parseDayParam(undefined, "2026-11-04"), "2026-11-04", "نبود پارامتر = روز مرجع");
  assert.equal(D.parseDayParam("2026-11-05", "2026-11-04"), "2026-11-05");
  assert.equal(D.parseDayParam("5/11/2026", "2026-11-04"), "2026-11-04", "قالب نادرست = روز مرجع");
  assert.equal(D.shiftDay("2026-11-04", 1), "2026-11-05");
  assert.equal(D.shiftDay("2026-11-01", -1), "2026-10-31", "عبور از مرز ماه");
  assert.equal(D.dayDiff("2026-11-07", "2026-11-04"), 3, "روز آینده مثبت است");
  assert.equal(D.dayLabel("2026-11-04", "2026-11-04", (d) => d), "امروز");
  assert.equal(D.dayLabel("2026-11-05", "2026-11-04", (d) => d), "فردا");
  assert.equal(D.dayLabel("2026-11-03", "2026-11-04", (d) => d), "دیروز");
  assert.equal(D.dayLabel("2026-11-09", "2026-11-04", (d) => "X" + d), "X2026-11-09", "خارج از سه روز، قالب‌ساز فراخوانی می‌شود");
  const win = D.dayWindow("2026-11-04", "Asia/Tehran");
  assert.equal(win.start.toISOString(), "2026-11-03T20:30:00.000Z", "نیمه‌شب تهران = ۲۰:۳۰ UTC روز قبل");
  assert.equal(win.end.toISOString(), "2026-11-04T20:30:00.000Z");
});

test("ابزار مشترک: صفحه‌بندی، ورودی عددی و قالب قیمت تومان", (t) => {
  if (skipIfNoBuild(t)) return;
  const U = lib("utils.js");
  assert.deepEqual(U.getPagination("http://x/api?page=3&limit=20"), { page: 3, limit: 20, skip: 40, take: 20 });
  assert.deepEqual(U.getPagination("http://x/api"), { page: 1, limit: 25, skip: 0, take: 25 }, "پیش‌فرض ۲۵");
  const capped = U.getPagination("http://x/api?page=-4&limit=99999");
  assert.equal(capped.page, 1, "page منفی باید به ۱ برگردد");
  assert.equal(capped.limit, 200, "سقف limit باید اعمال شود");
  assert.match(U.formatToman(120000), /تومان$/, "قیمت باید با واحد تومان تمام شود");
  assert.match(U.formatToman(120000), /۱۲۰/, "ارقام فارسی");
  assert.equal(U.toAsciiDigits(U.toPersianDigits("12-34")), "12-34");
  assert.deepEqual(U.parseIntInput("7abc", 5), { ok: true, value: 7 });
  assert.equal(U.parseIntInput("x", 5).ok, false, "ورودی غیرعدد باید خطا بدهد نه مقدار پیش‌فرض");
});

// ───────────────────────── سرور زنده (smoke) ─────────────────────────
const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

describe("سرور ساخته‌شده (backend/dist/main.js)", () => {
  let child = null;
  let base = "";
  let health = null;
  let bootLog = "";
  let skipReason = "";

  const get = async (path, opts = {}) => {
    const res = await fetch(base + path, { ...opts, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* پاسخ HTML/متنی */
    }
    return { status: res.status, ct: res.headers.get("content-type") || "", json, text };
  };

  /** با هدر Hostِ دلخواه — fetch این هدر را نادیده می‌گیرد، پس node:http لازم است */
  const withHost = (path, host, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = rawRequest(
        { host: "127.0.0.1", port: Number(base.split(":").pop()), path, method: "GET", headers: { host, ...headers } },
        (res) => {
          let text = "";
          res.on("data", (c) => (text += c));
          res.on("end", () => resolve({ status: res.statusCode, text }));
        }
      );
      req.on("error", reject);
      req.setTimeout(15000, () => req.destroy(new Error("timeout")));
      req.end();
    });

  before(async () => {
    if (!distReady) {
      skipReason = "backend/dist/main.js نیست (npm run build:backend)";
      return;
    }
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn("node", [DIST_MAIN], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), NODE_ENV: process.env.NODE_ENV || "production", SERVE_FRONTEND: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (bootLog += d.toString()));
    child.stderr.on("data", (d) => (bootLog += d.toString()));
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 700));
      try {
        const res = await fetch(`${base}/api/health?db=1`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          health = await res.json();
          break;
        }
      } catch {
        if (child.exitCode !== null) break;
      }
    }
    if (!health) skipReason = /Can't reach database server|P1001|ECONNREFUSED/i.test(bootLog) ? "دیتابیس در دسترس نیست" : "سرور در ۴۵ ثانیه بالا نیامد";
  });

  after(() => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 800).unref();
    }
  });

  const gated = (t) => {
    // ME-9: نبودِ بیلد شکست است (skip فقط با SKIP_MISSING_ARTIFACTS=1)؛ نبودِ دیتابیس
    // یا بالا نیامدن سرور همان skip می‌ماند — آن شرایط محیطی است، نه تستِ نجاریده.
    if (!requireArtifact(t, DIST_MAIN, "npm run build:backend")) return true;
    if (skipReason) t.skip(skipReason + " — برای این بخش بیلد و دیتابیس لازم است");
    return Boolean(skipReason);
  };

  test("/api/health زنده است و port درست گزارش می‌دهد", (t) => {
    if (gated(t)) return;
    assert.equal(health.status, "ok");
    assert.equal(Number(health.port), Number(base.split(":").pop()), "پورت گزارش‌شده با پورت واقعی یکی نیست");
  });

  test("نوک‌های عمومی بدون احراز هویت پاسخ ۲۰۰ می‌دهند", async (t) => {
    if (gated(t)) return;
    for (const path of ["/api/packages", "/api/salons/search?query=", "/api/mini/config", "/api/mini/featured", "/api/public/upload-limits"]) {
      const r = await get(path);
      assert.equal(r.status, 200, `${path} → ${r.status} ${r.text.slice(0, 120)}`);
    }
    const lim = await get("/api/public/upload-limits");
    assert.ok(["avatarMaxMb", "imageMaxMb", "voiceMaxMb"].every((k) => k in lim.json), "سقف آپلود باید به‌صورت مگابایت به کلاینت برسد");
  });

  test("نشانی‌های سرو‌شده با پورتِ میزبانِ درخواست ساخته می‌شوند (:3100 نه :5175)", async (t) => {
    if (gated(t)) return;
    const port = Number(base.split(":").pop());
    const mini = async (host) => JSON.parse((await withHost("/api/mini/config", host)).text);
    const onSalonHost = await mini("mah.localhost:3100");
    assert.equal(onSalonHost.miniUrl, "http://mah.localhost:3100/mini", "miniUrl باید میزبانِ درخواست را بگیرد");
    const onSelfHost = await mini(`localhost:${port}`);
    assert.equal(onSelfHost.miniUrl, `http://localhost:${port}/mini`, "پورتِ واقعیِ سرور هم حفظ می‌شود");
    const spoofed = await mini("evil.example.com");
    assert.ok(!String(spoofed.miniUrl).includes("evil.example.com"), `هاست جعلی در نشانی ننشیند: ${spoofed.miniUrl}`);
  });

  test("لودر داشبورد: publicUrl همان ساب‌دامینِ میزبانِ درخواست است", async (t) => {
    if (gated(t)) return;
    const login = await get("/api/admin/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@nobino.ir", password: "Admin@1234" }),
    });
    const token = login.json?.token || login.json?.accessToken || login.json?.data?.token;
    if (login.status !== 200 || !token) {
      t.skip(`ورود ادمین ممکن نشد (${login.status})`);
      return;
    }
    const search = await get("/api/salons/search?query=");
    const salon = (search.json?.salons ?? [])[0];
    if (!salon?.id || !salon?.slug) {
      t.skip("سالنی برای تست نیست");
      return;
    }
    const raw = await withHost(`/api/pages/dashboard-salon?salon=${salon.id}`, "mah.localhost:3100", {
      authorization: `Bearer ${token}`,
    });
    assert.equal(raw.status, 200, `لودر → ${raw.status} ${raw.text.slice(0, 160)}`);
    const body = JSON.parse(raw.text);
    const data = body?.data ?? body;
    assert.equal(data?.publicUrl, `http://${salon.slug}.localhost:3100`, "publicUrl باید ساب‌دامین با پورتِ میزبان باشد، نه /s/ روی SITE_URL");
  });

  test("صفحهٔ عمومی: /api/pages/<loader>", async (t) => {
    if (gated(t)) return;
    const ok = await get("/api/pages/home");
    assert.equal(ok.status, 200, `/api/pages/home → ${ok.status}`);
    assert.equal(ok.json?.success, true, "پاسخ لودر صفحه باید success داشته باشد");
    const unknown = await get("/api/pages/not-a-page");
    assert.equal(unknown.status, 404, "لودر ناشناخته باید ۴۰۴ بدهد نه ۵۰۰");
  });

  test("نوک‌های نگه‌داشته: بدون توکن ۴۰۱", async (t) => {
    if (gated(t)) return;
    for (const path of ["/api/salons", "/api/admin/users", "/api/admin/audit", "/api/notifications"]) {
      const r = await get(path);
      assert.equal(r.status, 401, `${path} باید ۴۰۱ بدهد، کد ${r.status} داد`);
    }
  });

  test("ورود سوپرادمینِ seed و دسترسی ادمین با توکن", async (t) => {
    if (gated(t)) return;
    if (health.db !== "up") {
      t.skip(`دیتابیس ${String(health.db)} است`);
      return;
    }
    const login = await get("/api/admin/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@nobino.ir", password: "Admin@1234" }),
    });
    assert.equal(login.status, 200, `ورود ادمین → ${login.status} ${login.text.slice(0, 160)}`);
    const token = login.json?.token || login.json?.accessToken || login.json?.data?.token;
    assert.ok(token, "پاسخ ورود توکن ندارد");
    const auth = { authorization: `Bearer ${token}` };
    const users = await get("/api/admin/users", { headers: auth });
    assert.equal(users.status, 200, `/api/admin/users با توکن → ${users.status}`);
    const ai = await get("/api/admin/ai/status", { headers: auth });
    assert.equal(ai.status, 200, "کنترلر دستی /api/admin/ai/status باید پاسخ دهد");
    assert.equal(typeof ai.json?.switchOn, "boolean", "پاسخ وضعیت AI کلید switchOn دارد");
    assert.ok(Array.isArray(ai.json?.llmProviders), "پاسخ وضعیت AI فهرست llmProviders دارد");
  });

  test("SPA سرو شده و fallback مسیر عمیق کار می‌کند", async (t) => {
    if (gated(t)) return;
    if (!requireArtifact(t, DIST_INDEX, "npm run build:frontend")) return;
    const root = await get("/");
    assert.equal(root.status, 200);
    assert.match(root.ct, /text\/html/);
    const deep = await get("/packages");
    assert.equal(deep.status, 200, "مسیر عمیق باید با fallback اسپا باز شود");
  });

  test("crash log: بوت بدون خطای غیرمنتظره", (t) => {
    if (gated(t)) return;
    const fatal = bootLog.split(/\r?\n/).filter((l) => /Nest can't resolve|UnhandledPromiseRejection|TypeError: .* is not a function/.test(l));
    assert.deepEqual(fatal, [], "خطای بوت:\n" + fatal.slice(0, 5).join("\n"));
  });
});
