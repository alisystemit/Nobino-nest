// تست تطبیق گفتار مشتری با کاتالوگ واقعی سالن (بدون سرور و دیتابیس)
//   • توابع خالصِ backend/dist/lib/ai/catalog-match.js
//   • پکیج باید اجباری و «درست» انتخاب شود: غلط املایی، صورت گفتاری و وام‌واژهٔ لاتین
//     تحمل می‌شوند، ولی اگر دو گزینه هم‌امتیاز باشند نتیجه «مبهم» است و باید پرسیده شود.
//   • آرایشگر اختیاری است و نام خودِ مشتری نباید با نام آرایشگر اشتباه شود.
// اجرا: node --test scripts/voice-match.test.mjs   |   برای بیلد: npm run build:backend
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..");
const MATCH = join(ROOT, "backend", "dist", "lib", "ai", "catalog-match.js");

if (!existsSync(MATCH)) {
  test("پیش‌نیاز", (t) => t.skip("backend/dist/lib/ai/catalog-match.js نیست — با «npm run build:backend» ساخته می‌شود"));
} else {
  const M = require(MATCH);

  const SERVICES = [
    { id: "s1", name: "کوتاهی مو" },
    { id: "s2", name: "اصلاح صورت و ریش" },
    { id: "s3", name: "رنگ مو" },
    { id: "s4", name: "رنگ و لایت" },
    { id: "s5", name: "کراتین و احیای مو" },
    { id: "s6", name: "شینیون" },
    { id: "s7", name: "براشینگ" },
    { id: "s8", name: "کاشت ناخن" },
    { id: "s9", name: "ژلیش" },
    { id: "s10", name: "مانیکور" },
    { id: "s11", name: "پدیکور" },
    { id: "s12", name: "کاشت مژه والیوم" },
    { id: "s13", name: "لیفت و لمینت مژه" },
    { id: "s14", name: "اصلاح ابرو" },
    { id: "s15", name: "هاشور ابرو" },
    { id: "s16", name: "میکاپ عروس" },
    { id: "s17", name: "پاکسازی پوست" },
    { id: "s18", name: "اپیلاسیون کامل" },
    { id: "s19", name: "ماساژ ریلکسی" },
    { id: "s20", name: "پکیج عروس" },
  ];
  const STAFF = [
    { id: "e1", name: "مریم رضایی" },
    { id: "e2", name: "سارا احمدی" },
    { id: "e3", name: "نگار محمدی" },
    { id: "e4", name: "الناز کریمی" },
  ];

  const svc = (said) => M.matchService(said, SERVICES);
  const id = (said) => svc(said)?.id ?? "";

  test("نام دقیق پکیج، بدون ابهام انتخاب می‌شود", () => {
    const hit = svc("کوتاهی مو");
    assert.equal(hit.id, "s1");
    assert.equal(hit.ambiguous, false);
    assert.equal(hit.name, "کوتاهی مو");
  });

  test("غلط املایی و فاصله‌گذاری گفتار به متن (ASR) پکیج را عوض نمی‌کند", () => {
    assert.equal(id("کوتا هی مو"), "s1", "نیم‌فاصله/فاصلهٔ اضافه");
    assert.equal(id("کوتاهی‌مو"), "s1", "نیم‌فاصله");
    assert.equal(id("کوتایی مو"), "s1", "ه → ی پایانی");
    assert.equal(id("جلیش"), "s9", "ژ → ج");
    assert.equal(id("بدیکور"), "s11", "پ → ب");
    assert.equal(id("کوراتین و احیا مو"), "s5");
    assert.equal(id("شینون"), "s6");
    assert.equal(id("میکروبلیدینگ ابرو"), "s15");
  });

  test("صورت گفتاری و فعلی جمله به پکیج درست نگاشت می‌شود", () => {
    assert.equal(id("موهامو کوتاه کن"), "s1");
    assert.equal(id("میخوام رنگ کنم"), "s3");
    assert.equal(id("شیو صورت"), "s2");
    assert.equal(id("ناخونامو ژلیش کن"), "s9");
    assert.equal(id("مژه هام والیوم"), "s12");
    assert.equal(id("ابروهامو بند بنداز"), "s14");
    assert.equal(id("صورتمو پاکسازی کن"), "s17");
  });

  test("وام‌واژهٔ لاتین همان پکیج فارسی است", () => {
    assert.equal(id("manicure"), "s10");
    assert.equal(id("pedicure"), "s11");
    assert.equal(id("highlight"), "s4");
    assert.equal(id("hair cut"), "s1");
    assert.equal(id("makeup عروس"), "s16");
    assert.equal(id("facial"), "s17");
  });

  test("ارقام فارسی و نویسه‌های عربی یکسان‌سازی می‌شوند و تطبیق را خراب نمی‌کنند", () => {
    assert.equal(M.normalizeFa("کوتاهی مو ۲"), "کوتاهی مو 2");
    assert.equal(M.normalizeFa("كوتاهی مو"), "کوتاهی مو");
    assert.equal(id("كوتاهی مو"), "s1");
  });

  test("پکیجی که در کاتالوگ سالن نیست، اختراع نمی‌شود", () => {
    assert.equal(svc("لیزر موهای زائد"), null, "سالن لیزر ندارد");
    assert.equal(svc("نوبت میخوام"), null);
    assert.equal(svc(""), null);
    assert.equal(M.matchService("کوتاهی مو", []), null);
  });

  test("دو گزینهٔ هم‌امتیاز = مبهم؛ باید از مشتری پرسیده شود", () => {
    const twin = [
      { id: "a", name: "کوتاهی مو" },
      { id: "b", name: "کوتاهی مو آقایان" },
    ];
    const hit = M.matchService("کوتاهی", twin);
    assert.ok(hit, "چیزی فهمیده شده");
    assert.equal(hit.ambiguous, true);
    assert.equal(hit.candidates.length, 2);
  });

  test("تطبیق کامل هرگز مبهم نمی‌شود حتی اگر گزینهٔ نزدیک دیگری باشد", () => {
    const twin = [
      { id: "a", name: "کوتاهی مو" },
      { id: "b", name: "کوتاهی مو آقایان" },
    ];
    const hit = M.matchService("کوتاهی مو", twin);
    assert.equal(hit.id, "a");
    assert.equal(hit.ambiguous, false);
  });

  test("«کوتاهی ناخن» با «کوتاهی مو» اشتباه نمی‌شود", () => {
    const catalog = [...SERVICES, { id: "s21", name: "کوتاهی ناخن" }];
    const hit = M.matchService("کوتاهی ناخن", catalog);
    assert.equal(hit.id, "s21");
  });

  test("آرایشگر از میان نام کامل، نام خانوادگی و نام کوچک پیدا می‌شود", () => {
    assert.equal(M.matchStaff("با مریم رضایی", STAFF).id, "e1");
    assert.equal(M.matchStaff("خانم رضایی", STAFF).id, "e1");
    assert.equal(M.matchStaff("مریم", STAFF).id, "e1");
    assert.equal(M.matchStaff("پیش نگار محمدی کارم رو انجام بده", STAFF).id, "e3");
    assert.equal(M.matchStaff("الناز", STAFF).id, "e4");
  });

  test("نام خودِ مشتری به‌جای آرایشگر ثبت نمی‌شود", () => {
    const said = "به نام سارا احمدی، فردا ساعت ده، کوتاهی مو";
    assert.equal(M.matchStaff(said, STAFF).id, "e2", "بدون حذف نام مشتری، اشتباه می‌گیرد");
    assert.equal(M.matchStaff(said, STAFF, { exclude: ["سارا احمدی"] }), null);
    assert.equal(
      M.matchStaff("به نام سارا احمدی، با مریم رضایی", STAFF, { exclude: ["سارا احمدی"] }).id,
      "e1"
    );
  });

  test("«فرقی نمی‌کند / هر کسی» یعنی آرایشگر اختیاری است", () => {
    for (const phrase of ["فرقی نداره", "هرکی باشه", "هر کی وقتش آزاده", "آرایشگر مهم نیست", "خودتون", "مهم نیست کی"]) {
      assert.equal(M.isAnyStaffPhrase(phrase), true, phrase);
    }
    assert.equal(M.isAnyStaffPhrase("با مریم رضایی"), false);
    assert.equal(M.isAnyStaffPhrase(""), false);
  });

  test("دو آرایشگر هم‌نام = مبهم، نه انتخاب زوری", () => {
    const same = [
      { id: "a", name: "مریم رضایی" },
      { id: "b", name: "مریم موسوی" },
    ];
    const hit = M.matchStaff("مریم", same);
    assert.equal(hit.ambiguous, true);
    assert.equal(hit.candidates.length, 2);
    assert.equal(M.matchStaff("مریم موسوی", same).ambiguous, false);
    assert.equal(M.matchStaff("مریم موسوی", same).id, "b");
  });

  test("نامی که در پرسنل سالن نیست، آرایشگر تولید نمی‌کند", () => {
    assert.equal(M.matchStaff("با بهرام", STAFF), null);
    assert.equal(M.matchStaff("مریم", []), null);
  });
}