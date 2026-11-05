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
 * اگر بک‌اند در دسترس نباشد فقط صفحات استاتیک prerender می‌شوند (هشدار لاگ).
 *
 * متغیرها:
 *   PRERENDER_API  (پیش‌فرض VITE_API_PROXY یا http://localhost:3100)
 *   VITE_SITE_URL / VITE_APP_URL — دامنهٔ نهایی برای canonical/sitemap
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
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
const isLoopback = (u) => {
  try {
    const h = new URL(u.startsWith("http") ? u : `http://${u}`).hostname;
    return h === "localhost" || h.endsWith(".localhost") || h === "::1" || h === "0.0.0.0" || /^127\./.test(h);
  } catch {
    return false;
  }
};
const ALLOW_LOCAL = /^(1|true)$/i.test(String(process.env.PRERENDER_ALLOW_LOCAL || ""));
const SITE_IS_PUBLIC = !isLoopback(SITE) || ALLOW_LOCAL;
/** پیشوند مطلقِ لینک‌ها؛ در مبنا لوکال خالی می‌ماند تا رلتیو بنویسیم */
const ABS = SITE_IS_PUBLIC ? SITE : "";
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

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function headBlock({ title, description, canonical, noindex, images = [] }) {
  const og = [
    `<meta property="og:type" content="website"/>`,
    `<meta property="og:locale" content="fa_IR"/>`,
    `<meta property="og:site_name" content="نوبینو"/>`,
    `<meta property="og:title" content="${esc(title)}"/>`,
    `<meta property="og:description" content="${esc(description)}"/>`,
    `<meta property="og:url" content="${esc(ABS + canonical)}"/>`,
    ...images.map((u) => `<meta property="og:image" content="${esc(/^https?:\/\//i.test(u) ? u : ABS + u)}"/>`),
    `<meta name="twitter:card" content="summary_large_image"/>`,
    `<meta name="twitter:title" content="${esc(title)}"/>`,
    `<meta name="twitter:description" content="${esc(description)}"/>`,
  ].join("\n");
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}"/>`,
    `<link rel="canonical" href="${esc(ABS + canonical)}"/>`,
    noindex ? `<meta name="robots" content="noindex,nofollow"/>` : `<meta name="robots" content="index,follow"/>`,
    og,
  ].join("\n");
}

function buildPage(template, { head, ld, noscript }) {
  let html = template
    // حذف تایتل/توضیح پیش‌فرض اسپا تا جایگزین‌های prerender بیایند
    .replace(/<title>[^<]*<\/title>/g, "")
    .replace(/<meta name="description"[^>]*>/g, "");
  const extras = [head, ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>` : "", noscript ? `<noscript>${noscript}</noscript>` : ""]
    .filter(Boolean)
    .join("\n");
  html = html.replace("</head>", `${extras}\n</head>`);
  return html;
}

async function fetchJson(path, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API + path, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
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
  const list = await fetchJson("/api/pages/seo-salons");
  if (list?.success && Array.isArray(list.data)) {
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
    console.warn(`prerender هشدار: بک‌اند ${API} در دسترس نبود — فقط صفحات استاتیک prerender شدند.`);
  }

  /* sitemap.xml و robots.txt — معادل src/app/sitemap.ts و robots.ts */
  const today = new Date().toISOString().slice(0, 10);
  const urls = ["/", "/login", "/packages", "/wa", "/help", "/salons", ...salonEntries, ...salonEntries.map((p) => p.replace(/^\/s/, "/wa/salon"))];
  if (SITE_IS_PUBLIC) {
    const sitemap =
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>`).join("\n") +
      `\n</urlset>\n`;
    writeFileSync(join(DIST, "sitemap.xml"), sitemap, "utf8");
    writeFileSync(
      join(DIST, "robots.txt"),
      `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dashboard/\nDisallow: /payment/result\n\nSitemap: ${SITE}/sitemap.xml\n`,
      "utf8",
    );
    console.log("prerender: sitemap.xml + robots.txt نوشته شدند");
  } else {
    // نوشتن نشانی لوکال در sitemap یعنی سوختن آدرس غلط روی دیسک؛ اگر بیلد
    // قبلی همین کار را کرده باشد، همان فایل‌ها را دور می‌ریزیم.
    for (const f of ["sitemap.xml", "robots.txt"]) {
      const p = join(DIST, f);
      if (existsSync(p) && readFileSync(p, "utf8").includes(SITE)) rmSync(p);
    }
    console.warn("prerender: sitemap.xml/robots.txt نوشته نشد (مبنا لوکال) — با VITE_SITE_URL دوباره اجرا کنید.");
  }
}

main().catch((err) => {
  console.error("prerender failed:", err);
  process.exit(1);
});
