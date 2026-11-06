// تست اجراییِ frontend/prerender.mjs در سندباکس (یافته‌های ME-11 و LO-1 از
// docs/audit-scripts-2026-11-05.md). کپی از prerender داخل یک tmp می‌رود تا DIST
// به پوشهٔ واقعی build اشاره نکند؛ با همین مسیرِ نسبی، dist/ کنار خودش می‌نویسد.
// اجرا: npm test   |   به بک‌اند یا دیتابیس نیازی ندارد (API جعلی داخل تست است).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const ROOT = join(import.meta.dirname, "..");
const SITE = "https://example.test";
const DEAD_API = "http://127.0.0.1:1"; // پورت ۱ هیچ سرویسی ندارد → خطای اتصال، سریع
const SALONS = [{ path: "/s/t", title: "سالن ت", description: "توضیح سالن ت", images: ["/seed/hero.svg"] }];

const SHELL = [
  `<!doctype html>`,
  `<html lang="fa" dir="rtl"><head>`,
  `<meta charset="UTF-8"/>`,
  `<title>نوبینو | رزرو آنلاین نوبت آرایشگاه</title>`,
  `</head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>`,
].join("\n");

/** پوشهٔ موقت با dist/index.html و کپی prerender.mjs (DIST کنار خودش می‌شود) */
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "nobino-prerender-"));
  mkdirSync(join(dir, "dist"), { recursive: true });
  writeFileSync(join(dir, "dist", "index.html"), SHELL, "utf8");
  cpSync(join(ROOT, "frontend", "prerender.mjs"), join(dir, "prerender.mjs"));
  return dir;
}

const runPrerender = (dir, env = {}) =>
  spawnSync(process.execPath, ["prerender.mjs"], {
    cwd: dir,
    encoding: "utf8",
    timeout: 60_000,
    env: { ...process.env, PRERENDER_ALLOW_NO_API: "", PRERENDER_ALLOW_LOCAL: "", VITE_SITE_URL: SITE, ...env },
  });

/** همان، ولی بک‌اند جعلیِ داخل همین تست نیاز دارد لوپ رویداد والد باز بماند (spawnSync آن را قفل می‌کند) */
const runPrerenderAsync = (dir, env = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["prerender.mjs"],
      {
        cwd: dir,
        env: { ...process.env, PRERENDER_ALLOW_NO_API: "", PRERENDER_ALLOW_LOCAL: "", VITE_SITE_URL: SITE, ...env },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });

const readIf = (dir, rel) => (existsSync(join(dir, "dist", rel)) ? readFileSync(join(dir, "dist", rel), "utf8") : "");

/** بک‌اند جعلیِ سئو: فهرست سالن‌ها + جزئیات هر سالن */
async function startStubApi() {
  const srv = createServer((req, res) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    const json = (body) => {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    if (path === "/api/pages/seo-salons") return json({ success: true, data: SALONS });
    if (path === "/api/pages/salon")
      return json({
        data: {
          found: true,
          salon: { name: "سالن ت", description: "توضیح", services: [{ name: "شینیون" }] },
          jsonLd: { "@type": "HairSalon", name: "سالن ت" },
        },
      });
    res.writeHead(404, { "content-type": "application/json" });
    res.end(`{"success":false}`);
  });
  await new Promise((resolve) => srv.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

describe("prerender — صفر صفحهٔ سالن = شکست (ME-11)", () => {
  test("بک‌اند در دسترس → کد ۰، صفحهٔ سالن با canonical و JSON-LD", async () => {
    const api = await startStubApi();
    const dir = sandbox();
    try {
      const r = await runPrerenderAsync(dir, { PRERENDER_API: api.url });
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /prerender: 1 صفحه سالن \+ نسخه wa/);
      assert.match(r.stdout, /prerender تمام شد: \d+ صفحهٔ استاتیک \+ 1 سالن/);
      assert.match(readIf(dir, "s/t/index.html"), /<link rel="canonical" href="https:\/\/example\.test\/s\/t"\/>/);
      assert.match(readIf(dir, "s/t/index.html"), /application\/ld\+json/);
      assert.doesNotMatch(readIf(dir, "wa/salon/t/index.html"), /application\/ld\+json/, "نسخهٔ wa بدون JSON-LD است");
    } finally {
      await api.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("بک‌اند نیست → کد ۱، پیام روی stderr و sitemap کهنه دست‌نخورده", () => {
    const dir = sandbox();
    try {
      writeFileSync(join(dir, "dist", "sitemap.xml"), `<urlset><url><loc>${SITE}/s/t</loc></url></urlset>`, "utf8");
      const r = runPrerender(dir, { PRERENDER_API: DEAD_API });
      assert.equal(r.status, 1, `باید با کد ۱ خارج شود: ${r.stdout}`);
      assert.match(r.stderr, /دادهٔ سئوی سالن‌ها از بک‌اند گرفته نشد/);
      assert.match(r.stderr, /بازنویسی نشد/);
      assert.match(readIf(dir, "sitemap.xml"), /\/s\/t/, "صفر صفحه نباید sitemap را خالی بازنویسی کند");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("PRERENDER_ALLOW_NO_API=1 → همان حالت با کد ۰ (ساخت عمدیِ بدون بک‌اند)", () => {
    const dir = sandbox();
    try {
      const r = runPrerender(dir, { PRERENDER_API: DEAD_API, PRERENDER_ALLOW_NO_API: "1" });
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /فهرست سئو از بک‌اند گرفته نشد/, "دلیل شکست روی stderr بماند");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("prerender — sitemap و robots (LO-1)", () => {
  test("فقط صفحه‌های indexable در sitemap؛ /admin/ در robots؛ /login Disallow نه", async () => {
    const api = await startStubApi();
    const dir = sandbox();
    try {
      const r = await runPrerenderAsync(dir, { PRERENDER_API: api.url });
      assert.equal(r.status, 0, r.stderr);
      const sitemap = readIf(dir, "sitemap.xml");
      const robots = readIf(dir, "robots.txt");
      assert.ok(sitemap && robots, "با مبنا عمومی هر دو فایل نوشته شود");
      for (const p of ["/", "/help", "/salons", "/packages", "/wa", "/s/t", "/wa/salon/t"]) {
        assert.ok(sitemap.includes(`<loc>${SITE}${p}</loc>`), `${p} باید در sitemap باشد`);
      }
      for (const p of ["/login", "/offline"]) {
        assert.ok(!sitemap.includes(`<loc>${SITE}${p}</loc>`), `${p} noindex است؛ در sitemap نباید باشد`);
      }
      assert.match(robots, /^Disallow: \/admin\/$/m);
      assert.match(robots, /^Disallow: \/dashboard\/$/m);
      assert.ok(!/^Disallow: \/login$/m.test(robots), "/login را Disallow نکنیم تا تگ noindex‌اش دیده شود");
    } finally {
      await api.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("مبنا لوکال → sitemap/robots کهنه حذف می‌شوند (CR-1)", () => {
    const dir = sandbox();
    try {
      writeFileSync(join(dir, "dist", "sitemap.xml"), "<stale/>", "utf8");
      writeFileSync(join(dir, "dist", "robots.txt"), "stale", "utf8");
      const r = runPrerender(dir, { PRERENDER_API: DEAD_API, PRERENDER_ALLOW_NO_API: "1", VITE_SITE_URL: "http://localhost:3100" });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(existsSync(join(dir, "dist", "sitemap.xml")), false, "sitemap لوکال/کهنه حذف شود");
      assert.equal(existsSync(join(dir, "dist", "robots.txt")), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("prerender — قرارداد منبع (ME-11/LO-2/LO-3)", () => {
  const src = readFileSync(join(ROOT, "frontend", "prerender.mjs"), "utf8");
  const paas = readFileSync(join(ROOT, "scripts", "paas-start.mjs"), "utf8");

  test("«۰ صفحه = موفق» برگشته نیست و شکست به لاگ PM2 می‌رسد", () => {
    assert.doesNotMatch(src, /console\.warn\(`prerender هشدار: بک‌اند/);
    assert.match(src, /process\.exitCode = 1/);
    assert.match(src, /PRERENDER_ALLOW_NO_API/);
    assert.match(paas, /spawnSync\(process\.execPath, \["prerender\.mjs"\],[\s\S]{0,400}?stdio: \["ignore", "pipe", "pipe"\]/);
    assert.match(paas, /\$\{r\.stdout[\s\S]{0,40}r\.stderr/, "هر دو stream خوانده شود");
  });

  test("fallback عمقیِ بدون صفحه، X-Robots-Tag noindex می‌گیرد (LO-2)", () => {
    const ops = readFileSync(join(ROOT, "backend", "src", "common", "ops-middleware.ts"), "utf8");
    assert.match(ops, /sendHtml\(req, res, shell, true\)/);
    assert.match(ops, /X-Robots-Tag", "noindex, nofollow"/);
  });

  test("سرورِ کشته‌شده با سیگنال، والد را با کد غیرصفر خارج می‌کند (LO-3)", () => {
    assert.match(paas, /if \(signal\) \{[\s\S]*?process\.exit\(requestedStop \? 0 : 1\)/);
  });
});
