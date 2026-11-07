// تست استخراج تاریخ از متن فارسی
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { requireArtifact } from "./lib/test-guard.mjs";

const ROOT = join(import.meta.dirname, "..");
const DIST_MAIN = join(ROOT, "backend", "dist", "main.js");
const require = createRequire(import.meta.url);
const load = () => require(join(ROOT, "backend", "dist", "lib", "ai", "parser.js"));
const skipIfNoBuild = (t) => !requireArtifact(t, DIST_MAIN, "npm run build:backend");

const TZ = "Asia/Tehran";

function todayIso() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date());
}
function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 864e5).toISOString().slice(0, 10);
}
function weekdayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
const WEEKDAY_NAMES = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

const today = todayIso();
const tomorrow = addDays(today, 1);
const afterTomorrow = addDays(today, 2);
const tenDays = addDays(today, 10);
const oneWeek = addDays(today, 7);
const twoWeeks = addDays(today, 14);

describe("استخراج تاریخ", () => {
  describe("تاریخ‌های نسبی", () => {
    test("امروز", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      assert.equal(resolveDate("امروز", TZ), today);
      assert.equal(resolveDate("تاریخ", TZ), undefined);
    });

    test("فردا", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      assert.equal(resolveDate("فردا", TZ), tomorrow);
    });

    test("پس‌فردا", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      assert.equal(resolveDate("پس فردا", TZ), afterTomorrow);
      assert.equal(resolveDate("پسفردا", TZ), afterTomorrow);
    });

    test("ده روز دیگه (رقمی)", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      assert.equal(resolveDate("10 روز دیگه", TZ), tenDays);
    });

    test("ده روز دیگه (گفتاری)", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      assert.equal(resolveDate("ده روز دیگه", TZ), tenDays);
    });

    test("یک هفته دیگه", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      assert.equal(resolveDate("یک هفته دیگه", TZ), oneWeek);
    });

    test("دو هفته بعد", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      assert.equal(resolveDate("دو هفته بعد", TZ), twoWeeks);
    });
  });

  describe("تاریخ میلادی عددی", () => {
    test("YYYY-MM-DD", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      assert.equal(resolveDate("2026-11-22", TZ), "2026-11-22");
      assert.equal(resolveDate("2026/11/22", TZ), "2026-11-22");
    });
  });

  describe("تاریخ شمسی", () => {
    test("روز به همراه ماه (رقمی)", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      const result = resolveDate("۲۲ آبان", TZ);
      assert.equal(result, "2026-11-13");
    });

    test("روز به همراه ماه (گفتاری)", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      const result = resolveDate("بیست و دو آبان", TZ);
      assert.equal(result, "2026-11-13");
    });

    test("روز ترتیبی + ماه", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      const result = resolveDate("بیست و دوم آبان", TZ);
      assert.equal(result, "2026-11-13");
    });
  });

  describe("روزهای هفته", () => {
    // امروز را تشخیص می‌دهیم
    const todayIdx = weekdayOf(today);
    const tomorrowIdx = (todayIdx + 1) % 7;
    const nextSaturdayIdx = (6 - todayIdx + 7) % 7 === 0 ? 7 : (6 - todayIdx + 7) % 7;

    test(WEEKDAY_NAMES[tomorrowIdx], (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      const expected = addDays(today, 1);
      const result = resolveDate(WEEKDAY_NAMES[tomorrowIdx], TZ);
      assert.equal(result, expected);
    });

    test("شنبه (هفته بعد)", (t) => {
      if (skipIfNoBuild(t)) return;
      const { resolveDate } = load();
      // شنبه هفتهٔ بعد = (شنبه - امروز + 7) روز بعد
      const days = (6 - todayIdx + 7) % 7;
      const expected = days === 0 ? addDays(today, 7) : addDays(today, days);
      const result = resolveDate("شنبه", TZ);
      assert.equal(result, expected);
    });
  });
});
