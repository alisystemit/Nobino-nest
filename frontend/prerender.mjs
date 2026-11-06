/**
 * Prerender صفحات عمومی برای SEO — جایگزین رندر سمت سرورِ Next.
 *
 * روش: روی خروجی vite (dist/index.html) هر مسیر عمومی یک کپی با هدر اختصاصی
 * (title/description/OG/canonical/robots + JSON-LD سالن‌ها) تزریق می‌شود.
 * محتوای متنی مهم در <noscript> هم نوشته می‌شود تا خزنده‌های بدون JS بتوانند.
 *
 * دیتای سئوی سالن‌ها از بک‌اند گرفته می‌شود:
 *   GET /api/pages/seo-salons  → فهرست {path,title,description,images}
 *   GET /api/pages/salon?slug= → JSON-LD (HairSalon) برای هر صفحه
 * اگر بک‌اند در دسترس نباشد فقط صفحات استاتیک prerender می‌شوند و خروج با کد ۱
 * تمام می‌شود (صفر صفحهٔ سالن = شکست، نه موفقیت)؛ برای ساخت عمدیِ بدون بک‌اند
 * PRERENDER_ALLOW_NO_API=1.
 *
 * متغیرها:
 *   PRERENDER_API  (پیش‌فرض VITE_API_PROXY یا http://localhost:3100)
 *   VITE_SITE_URL / VITE_APP_URL — دامنهٔ نهایی برای canonical/sitemap
 *   PRERENDER_ALLOW_NO_API=1 — بدون بک‌اند هم با کد ۰ خارج شود
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist");
const API = (process.env.PRERENDER_API || process.env.VITE_API_PROXY || "http://localhost:3100").replace(/\/+$/, "");
const SITE = (process.env.VITE_SITE_URL || process.env.VITE_APP_URL || API).replace(/\/+$/, "");

/**
 * نشانی حلقهٔ باز نباید به‌عنوان «دامنهٔ نهایی» در canonical/og:sitemap سوخته شود؛
 * اگر خروجی dist بعداً روی سرور واقعی سرو شود، همهٔ آن نشانی‌ها غلط می‌مانند.
 * با PRERENDER_ALLOW_LOCAL=1 می‌توان عمداً (برای دیدن نتیجه در لوکال) رد کرد.
 */
export const isLoopback = (u) => {
  try {
    // نشانی IPv6 در URL همیشه داخل کروشه می‌آید («[::1]»); اگر کروشه‌ها را
    // برنداریم، مقایسه هیچ‌گاه لوکال را نمی‌شناسد و نشانی تستی در canonical می‌سوزد.
    const h = new URL(u.startsWith("http") ? u : `http://${u}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "::" || h === "0.0.0.0" || /^127\./.test(h);
  } catch {
    return false;
  }
};

/**
 * پیشوند مطلقِ لینک‌ها: در مبنا لوکال خالی می‌ماند تا رلتیو بنویسیم؛ با
 * allowLocal (PRERENDER_ALLOW_LOCAL=1) عمداً همان نشانی لوکال می‌سوزد.
 * (تابع جدا شد تا در scripts/seo.test.mjs قابل تست باشد.)
 */
export function absPrefix(site, allowLocal = false) {
  return !isLoopback(site) || /^(1|true)$/i.test(String(allowLocal ?? "")) ? site : "";
}

const ALLOW_LOCAL = /^(1|true)$/i.test(String(process.env.PRERENDER_ALLOW_LOCAL || ""));
const ABS = absPrefix(SITE, ALLOW_LOCAL);
const SITE_IS_PUBLIC = ABS !== "";
if (!SITE_IS_PUBLIC) {
  console.warn(`prerender هشدار: مبنا «${SITE}» لوکال است → canonical/og با نشانی نسبی و بدون sitemap نوشته می‌شود. برای خروجی سئو VITE_SITE_URL (یا PRERENDER_ALLOW_LOCAL=1) بگذارید.`);
}

/** متادیتای صفحات استاتیک — همان مقدارهای نسخهٔ Next */
const STATIC_PAGES = [
  {
    path: "/",
    title: "نوبینو — نوبت‌دهی هوشمند آرایشگاه با رزرو صوتی",
    description:
      "پلتفرم نوبت‌دهی آنلاین و صوتی آرایشگاه‌ها: صفحه اختصاصی هر سالن، پیامک یادآوری، ۲۰+ درگاه پرداخت، مدیریت مالی و چندشعبه‌ای.",
  },
  {
    path: "/help",
    title: "مرکز راهنمای نوبینو — آموزش کامل مشتریان و سالن‌داران",
    description:
      "آموزش کامل استفاده از نوبینو: رزرو آنلاین و صوتی، مدیریت سالن، پیامک یادآوری، صندوق، فاکتور آنلاین، کمپین و گزارش‌گیری.",
  },
  {
    path: "/salons",
    title: "سالن‌های زیبایی — نوبینو",
    description: "جستجو و رزرو آنلاین نوبت آرایشگاه‌ها؛ صفحهٔ هر سالن با خدمات، قیمت، گالری و نظرات مشتریان.",
  },
  {
    path: "/packages",
    title: "پکیج‌ها و تعرفه — نوبینو",
    description: "مقایسه پلن‌های نوبینو (رایگان، پایه، حرفه‌ای، سازمانی) و سقف امکانات هر پلن.",
  },
  {
    path: "/wa",
    title: "وب‌اپ نوبینو",
    description: "وب‌اپ نوبت‌دهی صوتی نوبینو برای باز شدن در تلگرام، ایتا و بله.",
  },
  { path: "/login", title: "ورود / ثبت‌نام — نوبینو", description: "ورود به پنل نوبینو با شماره موبایل و رمز عبور.", noindex: true },
  { path: "/offline", title: "آفلاین — نوبینو", description: "ارتباط اینترنت برقرار نیست.", noindex: true },
];

/** مسیرهایی که فقط fallback اسپا می‌گیرند (noindex) */
const NOINDEX_SHELLS = ["/dashboard", "/admin", "/payment/result"];

export function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** متادیتای یک صفحه؛ `abs` پیشوند مطلق است (پیش‌فرض: همینی که از محیط ساخته می‌شود) */
export function headBlock({ title, description, canonical, noindex, images = [], abs = ABS }) {
  const og = [
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:locale" content="fa_IR"/>`,
    `<meta property="og:site_name" content="نوبینو"/>`,
    `<meta property="og:title" content="${esc(title)}"/>`,
    `<meta property="og:description" content="${esc(description)}"/>`,
    `<meta property="og:url" content="${esc(abs + canonical)}"/>`,
    ...images.map((u) => `<meta property="og:image" content="${esc(/^https?:\/\//i.test(u) ? u : abs + u)}"/>`),
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${esc(title)}"/>`,
    `<meta name="twitter:description" content="${esc(description)}"/>`,
  ].join("\n");
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}"/>`,
    `<link rel="canonical" href="${esc(abs + canonical)}"/>`,
    noindex ? `<meta name="robots" content="noindex,nofollow"/>` : `<meta name="robots" content="index,follow"/>`,
    og,
  ].join("\n");
}

/**
 * تزریق تگ‌های سئو داخل <head> قالب اسپا.
 *
 * نکتهٔ مهم: خودِ dist/index.html هم با مسیر «/» بازنویسی می‌شود، پس اگر فقط
 * title/description پاک شوند، دفعهٔ بعدی اجرا قالبِ آلوده را می‌خواند و
 * canonicalها تکراری می‌شوند (خزندهٔ گوگل اولی را می‌پذیرد → همهٔ صفحات سالن
 * canonical «/» می‌گیرند و از ایندکس می‌افتند). بنابراین هر بار همهٔ ردّ‌های
 * prerender پیشین پاک می‌شوند تا خروجی با هر تعداد اجرا یکسان بماند.
 */
export const SEO_STRIP = [
  /<title>[^<]*<\/title>/,
  /<meta[^>]*name="description"[^>]*>/,
  /<link[^>]*rel="canonical"[^>]*>/,
  /<meta[^>]*name="robots"[^>]*>/,
  /<meta[^>]*(?:property|name)="(?:og:|twitter:)[^"]*"[^>]*>/,
  /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/,
  /<noscript>[\s\S]*?<\/noscript>/,
];

export function buildPage(template, { head, ld, noscript }) {
  // هر الگو با فرورفتگی و خطِ خودش حذف می‌شود تا فایل هر بار دقیقاً یکسان بماند
  let html = template;
  for (const re of SEO_STRIP) html = html.replace(new RegExp(`[ \\t]*${re.source}[ \\t]*\\r?\\n?`, "g"), "");
  const extras = [head, ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : "", noscript ? `<noscript>${noscript}</noscript>` : ""]
    .filter(Boolean)
    .join("\n");
  html = html.replace("</head>", `${extras}\n</head>`);
  return html;
}

/** چرا بک‌اند فهرست سئو را نداد (برای پیام صادقانهٔ ME-11) */
let apiIssue = "";

async function fetchJson(path, timeoutMs = 8000, isProbe = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API + path, { signal: ctrl.signal });
    if (!res.ok) {
      if (isProbe) apiIssue = `HTTP ${res.status} از ${API}${path}`;
      return null;
    }
    return await res.json();
  } catch (e) {
    if (isProbe) apiIssue = e?.name === "AbortError" ? `timeout ${timeoutMs}ms از ${API}${path}` : `${e?.message || e} (${API}${path})`;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function writeRoute(pagePath, html) {
  const rel = pagePath === "/" ? "index.html" : pagePath.replace(/^\//, "") + "/index.html";
  const file = join(DIST, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html, "utf8");
}

async function main() {
  const template = readFileSync(join(DIST, "index.html"), "utf8");

  /* صفحات استاتیک */
  for (const p of STATIC_PAGES) {
    const head = headBlock({ ...p, canonical: p.path, images: ["/seed/hero.svg"] });
    writeRoute(p.path, buildPage(template, { head }));
  }
  for (const p of NOINDEX_SHELLS) {
    const head = headBlock({ title: "نوبینو", description: "پنل نوبینو", canonical: p, noindex: true });
    writeRoute(p, buildPage(template, { head }));
  }

  /* صفحات سالن‌ها از بک‌اند */
  let salonEntries = [];
  let apiOk = false;
  const list = await fetchJson("/api/pages/seo-salons", 8000, true);
  if (list?.success && Array.isArray(list.data)) {
    apiOk = true;
    for (const s of list.data) {
      const one = await fetchJson(`/api/pages/salon?slug=${encodeURIComponent(s.path.split("/").pop())}`);
      const salon = one?.data?.found ? one.data.salon : null;
      const head = headBlock({
        title: s.title,
        description: s.description,
        canonical: s.path,
        images: s.images,
      });
      const ld = one?.data?.jsonLd ?? null;
      const noscript = salon
        ? `<div style="font-family:tahoma"><h1>${esc(salon.name)}</h1><p>${esc(salon.description || s.description)}</p>${esc(
            (salon.services || []).slice(0, 12).map((x) => x.name).join("، "),
          )}</div>`
        : "";
      writeRoute(s.path, buildPage(template, { head, ld, noscript }));
      // نسخهٔ وب‌اپ پیام‌رسان (بدون JSON-LD)
      writeRoute(`/wa/salon${s.path.slice(2)}`, buildPage(template, { head: headBlock({ title: `${salon?.name ?? "سالن"} | نوبت صوتی`, description: s.description, canonical: `/wa/salon${s.path.slice(2)}`, images: s.images }) }));
      salonEntries.push(s.path);
    }
    console.log(`prerender: ${salonEntries.length} صفحه سالن + نسخه wa`);
  } else {
    console.error(`prerender خطا: فهرست سئو از بک‌اند گرفته نشد (${apiIssue || `پاسخ نامعتبر از ${API}/api/pages/seo-salons`}) — فقط صفحات استاتیک prerender شدند.`);
  }

  /* sitemap.xml و robots.txt — معادل src/app/sitemap.ts و robots.ts
     LO-1: فقط صفحه‌های indexable (noindex=false) در sitemap؛ /login و /offline
     که noindex هستند اینجا نیامده‌اند (سیگنال متضاد به خزنده). */
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ...STATIC_PAGES.filter((p) => !p.noindex).map((p) => p.path),
    ...salonEntries,
    ...salonEntries.map((p) => p.replace(/^\/s/, "/wa/salon")),
  ];
  if (SITE_IS_PUBLIC && !apiOk) {
    console.warn("prerender هشدار: sitemap.xml/robots.txt بازنویسی نشد — بدون فهرست سالن‌ها همهٔ آدرس‌های /s/ از sitemap پاک می‌شد.");
  } else if (SITE_IS_PUBLIC) {
    const sitemap =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>`).join("\n") +
      `\n</urlset>\n`;
    writeFileSync(join(DIST, "sitemap.xml"), sitemap, "utf8");
    writeFileSync(
      join(DIST, "robots.txt"),
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard/\nDisallow: /admin/\nDisallow: /payment/result\n\nSitemap: ${SITE}/sitemap.xml\n`,
      "utf8",
    );
    console.log(`prerender: sitemap.xml (${urls.length} آدرس) + robots.txt نوشته شدند`);
  } else {
    // نوشتن نشانی لوکال در sitemap یعنی سوختن آدرس غلط روی دیسک؛ در حالت لوکال
    // هر sitemap.xml/robots.txt موجودی را دور می‌ریزیم — این دو فایل فقط همین‌جا
    // تولید می‌شوند (در frontend/public وجود ندارند)، پس ماندنشان یعنی باقی‌ماندهٔ
    // یک بیلد دیگر با دامنهٔ دیگری، که سرو شدنش بدتر از نبودشان است.
    for (const f of ["sitemap.xml", "robots.txt"]) {
      const p = join(DIST, f);
      if (existsSync(p)) {
        rmSync(p);
        console.warn(`prerender: ${f} کهنه از دیست حذف شد (مبنا لوکال است)`);
      }
    }
    console.warn("prerender: sitemap.xml/robots.txt نوشته نشد (مبنا لوکال) — با VITE_SITE_URL دوباره اجرا کنید.");
  }

  return { staticPages: STATIC_PAGES.length + NOINDEX_SHELLS.length, salonPages: salonEntries.length, apiOk };
}

// وقتی فایل مستقیماً اجرا شود کار می‌کند؛ import شدنش (تست‌ها) بی‌اثر است —
// هیچ فایلی نمی‌نویسد و هیچ درخواستی به بک‌اند نمی‌زند.
const invokedDirectly = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main()
    .then((r) => {
      // ME-11: «صفر صفحهٔ سالن چون بک‌اند نبود» موفقیت نیست؛ تا کد غیرصفر نباشد،
      // build-release/paas-start همان را با warn رد می‌کنند و در PM2 گم می‌شود.
      console.log(`prerender تمام شد: ${r.staticPages} صفحهٔ استاتیک + ${r.salonPages} سالن (با نسخهٔ wa).`);
      const allowNoApi = /^(1|true|yes)$/i.test(String(process.env.PRERENDER_ALLOW_NO_API || ""));
      if (!r.apiOk && !allowNoApi) {
        console.error("❌ prerender: دادهٔ سئوی سالن‌ها از بک‌اند گرفته نشد. بک‌اند را بالا بیاورید و دوباره اجرا کنید");
        console.error(`   (اگر عمداً بدون بک‌اند می‌سازید: PRERENDER_ALLOW_NO_API=1)`);
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error("prerender failed:", err);
      process.exit(1);
    });
}
