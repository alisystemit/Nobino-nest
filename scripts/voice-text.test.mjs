// تست خالص استخراج شمارهٔ موبایل و ساعت از گفتار فارسی
// (منطق در backend/src/lib/ai/voice-text.ts — نیازمند بیلد بک‌اند)
//
// اجرا: npm test        (برای بیلد: npm run build:backend)
// چرا مهم: مدل ASR فارسی اعداد را گفتاری می‌نویسد («نهصد و شانزده») و نه
// رقمی؛ اگر فقط رقم‌واژه‌های تک‌رقمی خوانده شوند، شمارهٔ موبایل گم می‌شود.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { requireArtifact } from "./lib/test-guard.mjs";

const ROOT = join(import.meta.dirname, "..");
const DIST_MAIN = join(ROOT, "backend", "dist", "main.js");
const require = createRequire(import.meta.url);
const load = () => require(join(ROOT, "backend", "dist", "lib", "ai", "voice-text.js"));
const skipIfNoBuild = (t) => !requireArtifact(t, DIST_MAIN, "npm run build:backend");

describe("شمارهٔ موبایل گفتاری (ترکیب صد/ده/یکان)", () => {
  test("سه گروه عددی با ویرگول — نمونهٔ واقعی ۰۹۱۶۴۳۴۱۲۰۹", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone } = load();
    assert.equal(
      extractPhone("صفر نهصد و شانزده، چهارصد و سی و چهار، دوازده صفر نه"),
      "09164341209"
    );
  });

  test("ترکیب صد و دهگان و یکان — نمونهٔ واقعی ۰۹۱۷۱۹۷۱۶۹۹", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone } = load();
    assert.equal(
      extractPhone("صفر نهصد و هفده، صد و نود و هفت، شانزده نود و نه"),
      "09171971699"
    );
  });

  test("داخل جمله، بدون «صفر» ابتدایی و بدون «و» بین گروه‌ها", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone } = load();
    assert.equal(
      extractPhone("شماره موبایلم نهصد و شانزده چهارصد سی و چهار دوازده صفر نه هست"),
      "09164341209"
    );
  });

  test("رقم‌به‌رقم و با ارقام فارسی/لاتین", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone } = load();
    assert.equal(extractPhone("صفر نه یک شش چهار سه چهار یک دو صفر نه"), "09164341209");
    assert.equal(extractPhone("۰۹۱۶۴۳۴۱۲۰۹"), "09164341209");
    assert.equal(extractPhone("۰۹۱۶ ۴۳۴ ۱۲۰۹"), "09164341209");
  });

  test("«نه صد» جدا نوشته‌شده هم خوانده می‌شود", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone } = load();
    assert.equal(
      extractPhone("نه صد و شانزده چهار صد و سی و چهار دوازده صفر نه"),
      "09164341209"
    );
  });

  test("عددهای نامرتبط شماره حساب نمی‌شوند", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone } = load();
    assert.equal(extractPhone("سلام یک دو سه چهار پنج شیش"), undefined);
    assert.equal(extractPhone("نه، نمی‌خوام"), undefined);
    assert.equal(extractPhone("قیمت صد هزار تومان"), undefined);
    assert.equal(extractPhone("ساعت هشت شب میام"), undefined);
  });

  test("گروه چهاررقمی با «هزار» و مکث ویرگول — نمونهٔ واقعی ۰۹۱۶۷۵۰۸۲۰۰", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone } = load();
    assert.equal(
      extractPhone("شمارمم سفت نهصد و شانزده، هفتصد و پنجاه، هشت هزار و دویست"),
      "09167508200"
    );
    // بدون ویرگول هم مرز «… هزار» تشخیص داده می‌شود
    assert.equal(
      extractPhone("صفر نهصد و شانزده هفتصد و پنجاه هشت هزار و دویست"),
      "09167508200"
    );
  });

  test("اشتباهات رایج ASR برای «صفر» فقط پیش از عددِ ۹", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone } = load();
    for (const zero of ["صرف", "سرف", "سفر", "وصف", "وسف", "وسفت", "وصفت", "سفت"]) {
      assert.equal(
        extractPhone(`${zero} نهصد و شانزده، هفتصد و پنجاه، هشت هزار و دویست`),
        "09167508200",
        `«${zero}» باید صفرِ ابتدای شماره باشد`
      );
    }
    // بیرون از الگوی شماره، واژهٔ معمولی است و عدد نمی‌سازد
    assert.equal(extractPhone("قیمت صرف شده صد هزار تومان"), undefined);
    assert.equal(extractPhone("وسف صد هزار تومان"), undefined);
  });
});

describe("ساعت گفتاری", () => {
  test("«ساعت هشت شب» → ۲۰:۰۰", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractTime } = load();
    assert.equal(extractTime("ساعت هشت شب"), "20:00");
    assert.equal(extractTime("هشت شب"), "20:00");
    assert.equal(extractTime("ساعت هشت شب نوبت دارم"), "20:00");
  });

  test("دقیقه و نیم/ربع", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractTime } = load();
    assert.equal(extractTime("ساعت هشت و نیم شب"), "20:30");
    assert.equal(extractTime("ساعت هشت و ربع شب"), "20:15");
  });

  test("صبح و ظهر", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractTime } = load();
    assert.equal(extractTime("ساعت ده صبح"), "10:00");
    assert.equal(extractTime("ساعت دو بعدازظهر"), "14:00");
  });

  test("شمارهٔ موبایل با ساعت در یک جمله قاطی نمی‌شود", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractPhone, extractTime } = load();
    const text = "شماره من صفر نهصد و شانزده، چهارصد و سی و چهار، دوازده صفر نه هست و ساعت هشت شب میام";
    assert.equal(extractPhone(text), "09164341209");
    assert.equal(extractTime(text), "20:00");
  });
});
