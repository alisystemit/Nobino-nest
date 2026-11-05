// تست تولید صفحات سئو (prerender) — تابع‌های خالصِ frontend/prerender.mjs
//  • canonical/og در مبنا لوکال رلتی می‌شوند تا نشانی تستی در دیسک نسوزد
//  • buildPage در هر اجرا ردّ‌های سئوی پیشین را پاک می‌کند (اگر نشود، قالبِ
//    آلوده canonical «/» را به همهٔ صفحات سالن منتقل می‌کند و ایندکسشان می‌میرد)
// اجرا: npm test   |   نیازمند بیلد فرانت نیست (فقط کد ماژول خوانده می‌شود).
// prerender.mjs وقتی import شود کاری نمی‌کند؛ فقط با اجرای مستقیم صفحه می‌نویسد.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const P = await import(new URL("../frontend/prerender.mjs", import.meta.url).href);
const { absPrefix, isLoopback, headBlock, buildPage, esc } = P;

/** شمارش تگ‌ها در یک قطعه HTML */
const count = (html, re) => (html.match(re) || []).length;
const CANONICAL = /<link[^>]*rel="canonical"[^>]*>/g;
const OG_URL = /<meta[^>]*property="og:url"[^>]*>/g;
const ROBOTS = /<meta[^>]*name="robots"[^>]*>/g;
const TITLE = /<title>[^<]*<\/title>/g;
const LD = /<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/g;
const NOSCRIPT = /<noscript>[\s\S]*?<\/noscript>/g;

/** قالبی شبیه خروجی vite (تگ‌های غیرسئویی که باید بمانند) */
const SHELL = [
  `<!doctype html>`,
  `<html lang="fa" dir="rtl"><head>`,
  `<meta charset="UTF-8"/>`,
  `<link rel="manifest" href="/manifest.webmanifest"/>`,
  `<link rel="icon" type="image/svg+xml" href="/icons/icon.svg"/>`,
  `<title>نوبینو | رزرو آنلاین نوبت آرایشگاه</title>`,
  `<meta name="description" content="توضیح پیش‌فرض اسپا"/>`,
  `</head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>`,
].join("\n");

const md = (over = {}) =>
  headBlock({ title: "سالن ماه", description: "سالن زیبایی ماه", canonical: "/s/mah", images: ["/seed/mah-banner.svg"], ...over });

describe("مبنای نشانی (canonical/og/sitemap)", () => {
  test("لوکال و *.localhost → پیشوند خالی (نشانی تستی نمی‌سوزد)", () => {
    for (const local of ["http://localhost:3100", "http://127.0.0.1:3100", "http://mah.localhost:5175", "http://[::1]:3100", "http://0.0.0.0:3100"]) {
      assert.equal(absPrefix(local), "", `«${local}» لوکال است`);
      assert.equal(isLoopback(local), true, `isLoopback برای «${local}»`);
    }
  });

  test("دامنهٔ واقعی → همان نشانی مطلق", () => {
    assert.equal(absPrefix("https://nobino.ir"), "https://nobino.ir");
    assert.equal(isLoopback("https://mah.nobino.ir"), false);
    // نشانی بدون پروتکل هم بررسی می‌شود (SITE از env گاه بدون scheme می‌آید)
    assert.equal(absPrefix("localhost:3100"), "");
  });

  test("PRERENDER_ALLOW_LOCAL با «1|true» رد می‌شود، با «0» نه", () => {
    assert.equal(absPrefix("http://localhost:3100", "1"), "http://localhost:3100", "پیش‌فرض آگاهانه لوکال");
    assert.equal(absPrefix("http://localhost:3100", "true"), "http://localhost:3100");
    assert.equal(absPrefix("http://localhost:3100", "0"), "", "«0» نباید لوکال را بپذیرد");
    assert.equal(absPrefix("http://localhost:3100", ""), "");
  });

  test("فرار HTML در متن‌های فارسی/کاربری", () => {
    assert.equal(esc('a"b<c>&'), "a&quot;b&lt;c&gt;&amp;");
    assert.equal(esc(null), "");
    // عنوانی که «</title><script>» دارد نباید بتواند تگ را زودبندد یا اسکریپت تزریق کند
    const h = md({ title: 'سالن"</title><script>alert(1)</script>' });
    assert.equal(count(h, TITLE), 1, "همیشه فقط یک title");
    assert.doesNotMatch(h, /<script>/, "تگ script تزریق‌شده نباید باقی بماند");
    assert.match(h, /&lt;script&gt;/, "متن خام به entity تبدیل شود");
  });
});

describe("هدر یک صفحه", () => {
  test("مبنا لوکال → canonical و og رلتی؛ مبنا عمومی → مطلق", () => {
    const rel = md({ abs: "" });
    assert.match(rel, /<link rel="canonical" href="\/s\/mah"\/>/);
    assert.match(rel, /<meta property="og:url" content="\/s\/mah"\/>/);
    assert.match(rel, /<meta property="og:image" content="\/seed\/mah-banner\.svg"\/>/);

    const abs = md({ abs: "https://nobino.ir" });
    assert.match(abs, /<link rel="canonical" href="https:\/\/nobino\.ir\/s\/mah"\/>/);
    assert.match(abs, /property="og:image" content="https:\/\/nobino\.ir\/seed\/mah-banner\.svg"/);
    // تصویر مطلق نباید دوباره پیشوند بگیرد
    assert.match(md({ abs: "https://nobino.ir", images: ["https://cdn.example.com/a.svg"] }), /og:image" content="https:\/\/cdn\.example\.com\/a\.svg"/);
  });

  test("هر صفحه فقط یک canonical/og:url/robots/title دارد", () => {
    const h = md();
    assert.equal(count(h, CANONICAL), 1);
    assert.equal(count(h, OG_URL), 1);
    assert.equal(count(h, ROBOTS), 1);
    assert.equal(count(h, TITLE), 1);
  });

  test("noindex فقط برای صفحه‌های پنل", () => {
    assert.match(md({ noindex: true }), /<meta name="robots" content="noindex,nofollow"\/>/);
    assert.match(md(), /<meta name="robots" content="index,follow"\/>/);
  });
});

describe("buildPage — idempotent بودن (نقص اصلی)", () => {
  test("قالب تازه: یک بار تزریق، تگ‌های غیرسئویی می‌مانند", () => {
    const out = buildPage(SHELL, { head: md() });
    assert.equal(count(out, CANONICAL), 1);
    assert.equal(count(out, TITLE), 1, "تایتل پیش‌فرض اسپا حذف و جایگزین شود");
    assert.doesNotMatch(out, /توضیح پیش‌فرض اسپا/);
    // این‌ها هرگز نباید پاک شوند
    assert.match(out, /rel="manifest"/);
    assert.match(out, /rel="icon"/);
    assert.match(out, /charset="UTF-8"/);
    assert.match(out, /<script type="module" src="\/assets\/index-abc\.js">/);
    assert.ok(out.indexOf("<link rel=\"canonical\"") < out.indexOf("</head>"), "هدر قبل از </head> تزریق شود");
  });

  test("اجرای دوم روی خروجی قبلی canonical تکراری نمی‌سازد", () => {
    // خودِ dist/index.html هم با مسیر «/» بازنویسی می‌شود، پس قالب دفعهٔ بعد
    // آلوده است؛ بدون این پاک‌سازی canonical «/» در همهٔ صفحات می‌ماند.
    let html = buildPage(SHELL, { head: md() });
    for (let i = 0; i < 3; i++) html = buildPage(html, { head: md({ title: `سالن ماه ${i}` }) });
    assert.equal(count(html, CANONICAL), 1);
    assert.equal(count(html, OG_URL), 1);
    assert.equal(count(html, ROBOTS), 1);
    assert.equal(count(html, TITLE), 1);
    assert.match(html, /<title>سالن ماه 2<\/title>/, "تایتل آخرین اجرا برنده باشد");
  });

  test("canonical کهنه با دامنهٔ دیگر هم پاک می‌شود", () => {
    const polluted = SHELL.replace("</head>", `<link rel="canonical" href="https://old.example.com/s/mah"/>\n<meta property="og:url" content="https://old.example.com/s/mah"/>\n</head>`);
    const out = buildPage(polluted, { head: md({ abs: "" }) });
    assert.equal(count(out, CANONICAL), 1);
    assert.doesNotMatch(out, /old\.example\.com/);
  });

  test("JSON-LD و noscript روی هم انبار نمی‌شوند", () => {
    let html = buildPage(SHELL, { head: md(), ld: { "@type": "HairSalon", name: "ماه" }, noscript: "<h1>سالن ماه</h1>" });
    assert.equal(count(html, LD), 1);
    assert.equal(count(html, NOSCRIPT), 1);
    html = buildPage(html, { head: md(), ld: { "@type": "HairSalon", name: "ماه" }, noscript: "<h1>سالن ماه</h1>" });
    assert.equal(count(html, LD), 1, "ld+json دوم جایگزین شود نه اضافه");
    assert.equal(count(html, NOSCRIPT), 1);
  });

  test("خروجی با هر تعداد اجرا بایت‌به‌بایت یکسان می‌ماند", () => {
    const a = buildPage(buildPage(SHELL, { head: md() }), { head: md() });
    const b = buildPage(SHELL, { head: md() });
    assert.equal(a.includes("<link rel=\"canonical\""), true);
    assert.equal(count(a, CANONICAL), count(b, CANONICAL), "تعداد canonical در اجرای دوم تغییر نکند");
    assert.ok(!/\n[ \t]*\n[ \t]*\n/.test(a), "خط‌های خالی انبار نشود (خروجی پایدار)");
  });
});
