// تست خالص استخراج نام مشتری از گفتار فارسی
// (منطق: backend/src/lib/ai/text-fields.ts + فهرست نام‌ها: names-fa.ts)
//
// اجرا: npm test        (برای بیلد: npm run build:backend)
// چرا مهم: ASR فارسی «اسمم/اسممه/است» را به نام می‌چسباند و بدون فهرست نام،
// «کوتاهی مو» یا «فردا» هم به‌جای نام ثبت می‌شد.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { requireArtifact } from "./lib/test-guard.mjs";

const ROOT = join(import.meta.dirname, "..");
const DIST_MAIN = join(ROOT, "backend", "dist", "main.js");
const require = createRequire(import.meta.url);
const load = () => require(join(ROOT, "backend", "dist", "lib", "ai", "text-fields.js"));
const skipIfNoBuild = (t) => !requireArtifact(t, DIST_MAIN, "npm run build:backend");

describe("استخراج نام از گفتار", () => {
  test("«اسممه» چسبیده به انتهای نام، جزو نام نمی‌شود", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractNameFromText } = load();
    assert.equal(extractNameFromText("زهرا امیراببراهیمی اسممه"), "زهرا امیراببراهیمی");
  });

  test("پسوند چسبیدهٔ «است» از نام جدا می‌شود", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractNameFromText } = load();
    assert.equal(extractNameFromText("اسمم علیرضااست برا پس فردا نوبت میام"), "علیرضا");
    assert.equal(extractNameFromText("اسم من سارا احمدی است"), "سارا احمدی");
  });

  test("«به نام» و «مشتری» و «من … هستم»", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractNameFromText } = load();
    assert.equal(extractNameFromText("به نام سارا احمدی"), "سارا احمدی");
    assert.equal(extractNameFromText("مشتری سارا احمدی"), "سارا احمدی");
    assert.equal(extractNameFromText("من زهرا امیرابراهیمی هستم"), "زهرا امیرابراهیمی");
  });

  test("کلمه‌های معمولی جمله نام نمی‌شوند", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractNameFromText } = load();
    assert.equal(extractNameFromText("کوتاهی مو میخوام"), undefined);
    assert.equal(extractNameFromText("زهرا کوتاهی مو میخوام"), "زهرا");
    assert.equal(extractNameFromText("سلام محمد فردا میخوام بیام آرایشگاه"), "محمد");
    assert.equal(extractNameFromText("سلام"), undefined);
  });

  test("نام‌های زنانه که به «ه» ختم می‌شوند خراب نمی‌شوند", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractNameFromText } = load();
    for (const name of ["بهاره", "مهدیه", "حمیده", "فریده", "مریم", "الهه", "زهره"]) {
      assert.equal(extractNameFromText(name), name);
    }
  });

  test("حالت پرسش مجدد: نام نادر/تک‌کلمه‌ای هم پذیرفته می‌شود", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractNameFromText } = load();
    assert.equal(extractNameFromText("رها", { permissive: true }), "رها");
    assert.equal(extractNameFromText("اسمم رها"), "رها");
    assert.equal(extractNameFromText("اسممه"), undefined);
  });

  test("املای عربی (ي/ك) هم تطبیق داده می‌شود", (t) => {
    if (skipIfNoBuild(t)) return;
    const { extractNameFromText } = load();
    assert.equal(extractNameFromText("اسمم زينب"), "زينب");
    assert.equal(extractNameFromText("اسمم علي"), "علي");
  });
});
