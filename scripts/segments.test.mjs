// تست منطق بخش‌بندی مخاطب کمپین (بدون سرور و دیتابیس)
//   • تابع خالصِ backend/dist/lib/marketing/segments-core.js
//   • پیش‌نمایش مخاطب و ارسال واقعی هر دو همین تطبیق را می‌بینند، پس اینجا همان
//     چیزی که سالن در فرم می‌بیند سنجیده می‌شود.
// اجرا: node --test scripts/segments.test.mjs   |   برای بیلد: npm run build:backend
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..");
const CORE = join(ROOT, "backend", "dist", "lib", "marketing", "segments-core.js");

if (!existsSync(CORE)) {
  test("پیش‌نیاز", (t) => t.skip("backend/dist/lib/marketing/segments-core.js نیست — با «npm run build:backend» ساخته می‌شود"));
} else {
  const S = require(CORE);
  const NOW = Date.parse("2026-11-05T12:00:00Z");
  const DAY = 86_400_000;

  const fact = (o = {}) => ({
    phone: o.phone ?? "09121234567",
    name: o.name ?? "مشتری",
    tags: o.tags ?? [],
    visits: o.visits ?? 1,
    spend: o.spend ?? 0,
    lastVisitAt: o.daysAgo === undefined ? NOW - DAY : NOW - o.daysAgo * DAY,
    categories: o.categories ?? [],
    staffIds: o.staffIds ?? [],
  });
  const m = (key, o = {}) => S.matchCustomer(fact(o), key, S.parseFilters(o.f ?? {}), NOW);

  test("preset پایه: همهٔ مشتریان، مراجعان و مشتری تازه", () => {
    assert.equal(m("ALL", { visits: 1 }), true);
    assert.equal(m("ALL", { visits: 0 }), false, "بی‌نوبت نباید مخاطب باشد");
    assert.equal(m("RETURNING", { visits: 2 }), true);
    assert.equal(m("RETURNING", { visits: 1 }), false);
    assert.equal(m("NEW", { visits: 1 }), true);
    assert.equal(m("NEW", { visits: 2 }), false);
  });

  test("RECENT و SILENT با پنجرهٔ روز، از جمله مقدار پیش‌فرض", () => {
    assert.equal(m("RECENT", { daysAgo: 5 }), true);
    assert.equal(m("RECENT", { daysAgo: 20 }), false, "پیش‌فرض ۱۴ روز");
    assert.equal(m("RECENT", { daysAgo: 20, f: { recentDays: 30 } }), true);
    assert.equal(m("SILENT", { daysAgo: 90 }), true);
    assert.equal(m("SILENT", { daysAgo: 30 }), false, "پیش‌فرض ۶۰ روز");
    assert.equal(m("SILENT", { daysAgo: 30, f: { silentDays: 21 } }), true);
    assert.equal(m("SILENT", { lastVisitAt: null, visits: 3 }), false, "بی‌تاریخ مراجعه حذف می‌شود");
  });

  test("VIP هم نوبت و هم خرید را باید پر کند", () => {
    assert.equal(m("VIP", { visits: 4, spend: 2_500_000 }), true);
    assert.equal(m("VIP", { visits: 5, spend: 900_000 }), false, "خرید کم، ویژه نیست");
    assert.equal(m("VIP", { visits: 2, spend: 9_000_000 }), false, "کم‌مراجعه، ویژه نیست");
    assert.equal(m("VIP", { visits: 6, spend: 300_000, f: { minSpend: 250_000 } }), false, "سقف دستی کاربر VIP را سخت‌تر می‌کند نه آسان‌تر");
  });

  test("معیارهای دستی روی هر preset اعمال می‌شوند", () => {
    assert.equal(m("ALL", { f: { minVisits: 3 }, visits: 4 }), true);
    assert.equal(m("ALL", { f: { minVisits: 3 }, visits: 2 }), false);
    assert.equal(m("ALL", { f: { maxVisits: 2 }, visits: 7 }), false);
    assert.equal(m("RETURNING", { f: { minSpend: 500_000 }, visits: 3, spend: 480_000 }), false);
    assert.equal(m("RETURNING", { f: { maxSpend: 500_000 }, visits: 3, spend: 480_000 }), true);
  });

  test("برچسب‌ها: یکی‌درمیان برای شمول، هرکدام برای حذف", () => {
    const beard = { tags: ["ریش", "مداوم"] };
    assert.equal(m("ALL", { ...beard, f: { tags: ["داماد"] } }), false);
    assert.equal(m("ALL", { ...beard, f: { tags: ["داماد", "ریش"] } }), true);
    assert.equal(m("ALL", { ...beard, f: { excludeTags: ["مداوم"] } }), false);
    assert.equal(m("ALL", { tags: ["فید"], f: { excludeTags: ["مرجوعی"] } }), true);
  });

  test("دستهٔ خدمت و آرایشگرِ مشخص", () => {
    assert.equal(m("SILENT", { daysAgo: 100, categories: ["ریش و اصلاح"], f: { category: "ریش و اصلاح" } }), true);
    assert.equal(m("SILENT", { daysAgo: 100, categories: ["مو و فید"], f: { category: "ریش و اصلاح" } }), false);
    assert.equal(m("ALL", { staffIds: ["st-1"], f: { staffId: "st-1" } }), true);
    assert.equal(m("ALL", { staffIds: ["st-2"], f: { staffId: "st-1" } }), false);
  });

  test("parseFilters ورودی کثیف را نرمال و clamp می‌کند", () => {
    const f = S.parseFilters({ tags: [" ریش ", "ریش", "", null], silentDays: "90", recentDays: 9999, minSpend: -5, category: "  ", staffId: undefined });
    assert.deepEqual(f.tags, ["ریش"], "تکراری و خالی حذف و فاصلهTrim می‌شود");
    assert.equal(f.silentDays, 90, "رشتهٔ عددی پذیرفته می‌شود");
    assert.equal(f.recentDays, 365, "خارج از بازه clamp می‌شود");
    assert.equal(f.minSpend, 0, "منفی به صفر برمی‌گردد");
    assert.equal(f.category, null);
    assert.equal(f.staffId, null);
    assert.equal(S.isEmptyFilters(S.parseFilters(undefined)), true);
    assert.equal(S.isEmptyFilters(S.parseFilters(null)), true);
    assert.equal(S.isEmptyFilters(S.parseFilters({ tags: ["x"] })), false);
  });

  test("خلاصهٔ فارسی بخش‌بندی برای فهرست کمپین", () => {
    assert.equal(S.segmentSummary("ALL", S.parseFilters({})), "همهٔ مشتریان");
    assert.match(S.segmentSummary("SILENT", S.parseFilters({})), /60 روز سکوت/);
    assert.match(S.segmentSummary("SILENT", S.parseFilters({ silentDays: 30 })), /30 روز سکوت/);
    assert.match(S.segmentSummary("RETURNING", S.parseFilters({ tags: ["ریش"], category: "مو و فید" })), /مراجعان.*برچسب: ریش.*خدمت: مو و فید/);
    assert.equal(S.segmentSummary("ناشناخته", S.parseFilters({})), "همهٔ مشتریان", "preset ناشناخته به ALL برمی‌گردد");
  });

  test("شمارهٔ قابل ارسال، همان قاعدهٔ قدیمی", () => {
    assert.equal(S.isSendablePhone("09121234567"), true);
    assert.equal(S.isSendablePhone("9121234567"), true);
    assert.equal(S.isSendablePhone("+989121234567"), false);
    assert.equal(S.isSendablePhone("02122334455"), false);
    assert.equal(S.isSendablePhone(""), false);
  });

  test("کلیدهای preset و پیش‌فرض‌ها ثابت‌اند (UI به آن‌ها تکیه می‌کند)", () => {
    assert.deepEqual([...S.SEGMENT_KEYS], ["ALL", "RETURNING", "NEW", "RECENT", "SILENT", "VIP"]);
    assert.equal(S.DEFAULT_SILENT_DAYS, 60);
    assert.equal(S.DEFAULT_RECENT_DAYS, 14);
    assert.equal(S.VIP_MIN_VISITS, 3);
    assert.equal(S.VIP_MIN_SPEND, 2_000_000);
  });
}
