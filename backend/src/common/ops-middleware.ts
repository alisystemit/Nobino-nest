/**
 * میدل‌ور عملیاتی پروداکشن (تک‌پروسه: API + SPA در یک پورت).
 *
 * چرا لازم است؟ نسخه NestJS یک SPA (Vite/react-router) دارد که در حالت توسعه با
 * `vite dev` روی پورت ۵۱۷۵ و با پروکسی Vite سرو می‌شود. در PaaS (Railway،
 * Render، ابر آراس، ...) معمولاً فقط **یک** پورت و یک کانتینر داده می‌شود، پس
 * باید خودِ بک‌اند فایل‌های استاتیک `frontend/dist` را هم سرو کند.
 *
 * سه کار انجام می‌دهد (به همین ترتیب اولویت):
 *  ۱) `GET /api/health` و `GET /healthz` — بررسی سلامت (برای healthcheck داکر،
 *     PM2، load-balancer و cronitor). با `?db=1` یک ping واقعی به PostgreSQL هم می‌زند.
 *     این بلوک قبل از روتر Nest جواب می‌دهد؛ بازرسی عمیق‌تر (نوع خطای دیتابیس و
 *     وجود جدول‌ها) در `routes/api/health__db.ts` روی `GET /api/health/db` است.
 *  ۲) سرو فایل‌های استاتیک build فرانت (اسکریپت/سبک/آیکون/sw.js) با کش درست.
 *  ۳) fallback اسپا: مسیرهای GET که فایل ندارند، صفحهٔ prerender شده‌اش اگر
 *     وجود دارد (`/s/mah/index.html`) و در غیر این صورت `index.html` می‌گیرد.
 *
 * مسیرهای `/api/*` و `/uploads/*` هرگز اینجا سرو نمی‌شوند؛ به روتر Nest
 * (کنترلرها) و پوشه `public/` واگذار می‌شوند تا API یا آپلودها خراب نشوند.
 */
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, relative, resolve } from "node:path";
import express from "express";
import { prisma } from "@/lib/prisma";
import { nodeEnv } from "@/lib/env";

/** مسیرهای جلو‌نبوردهٔ API/آپلود که نباید به اسپا بروند */
const RESERVED_PREFIXES = ["/api", "/uploads", "/voice"];

/** آیا مقدار env مثل «true/1/yes/on» است */
function truthy(value: string | null | undefined, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

/**
 * پوشهٔ build فرانت. با `SPA_DIST` قابل بازنویسی است؛ در غیر این صورت چند
 * مسیر محتمل را امتحان می‌کند (ریشهٔ مخزن در dev، `/app` در ایمیج داکر).
 */
export function spaDistDir(): string | null {
  const candidates: string[] = [];
  if (process.env.SPA_DIST) candidates.push(resolve(process.env.SPA_DIST));
  // __dirname در بیلد = backend/dist/common  →  ../../.. = ریشهٔ مخزن
  candidates.push(
    resolve(__dirname, "..", "..", "..", "frontend", "dist"),
    resolve(process.cwd(), "frontend", "dist"),
    resolve(process.cwd(), "..", "frontend", "dist"),
    join(process.cwd(), "public", "app"),
  );
  for (const dir of candidates) {
    if (dir && existsSync(join(dir, "index.html"))) return dir;
  }
  return null;
}

/** فایل مناسب یک مسیر (HTML یا استاتیکِ مانده از مرحلهٔ static) */
function resolveFile(dist: string, pathname: string): string | null {
  let clean = pathname.replace(/\/+$/, "") || "/";
  try {
    clean = decodeURIComponent(clean);
  } catch {
    return null;
  }
  if (clean.includes("..")) return null;
  const rel = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const base = join(dist, rel);
  if (extname(base)) return existsSync(base) ? base : null;
  const htmlCandidates = [`${base}.html`, join(base, "index.html")];
  for (const candidate of htmlCandidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null; // اسپا fallback خودشان مدیریت می‌کند
}

function setCache(res: ServerResponse, urlPath: string) {
  const p = String(urlPath || "");
  if (p.startsWith("/api") || p === "/sw.js" || p === "/healthz") {
    res.setHeader("Cache-Control", "no-store");
    return;
  }
  if (p.startsWith("/uploads/") || p.startsWith("/voice/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  if (p.startsWith("/assets/") || p.startsWith("/fonts/") || p.startsWith("/icons/") || p.startsWith("/seed/")) {
    // فایل‌های Vite هَش دارند؛ کش طولانی بی‌خطر است
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }
  if (p === "/manifest.webmanifest" || p.endsWith(".webmanifest")) {
    res.setHeader("Cache-Control", "public, max-age=300");
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
}

async function dbPing(timeoutMs = 1500): Promise<"up" | "down"> {
  try {
    const guard = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("db-timeout")), Math.max(200, timeoutMs)).unref?.(),
    );
    await Promise.race([prisma.$queryRaw`SELECT 1`, guard]);
    return "up";
  } catch {
    return "down";
  }
}

/**
 * آیا سرو SPA در این پروسه فعال است؟
 * با `SERVE_FRONTEND=0|false|no|off` یا `SPA_DISABLED=1` خاموش می‌شود؛
 * اگر build فرانت اصلاً وجود نداشته باشد هم خودکار خاموش است.
 */
export function spaServingEnabled(): boolean {
  if (/^(0|false|no|off)$/i.test((process.env.SERVE_FRONTEND || "").trim())) return false;
  if (truthy(process.env.SPA_DISABLED, false)) return false;
  return spaDistDir() !== null;
}

/** بدنهٔ پاسخ /api/health — هر دو مسیر (health و healthz) از آن استفاده می‌کنند */
async function healthPayload(req: IncomingMessage) {
  const url = new URL(req.url || "/", "http://internal");
  const wantDb = truthy(url.searchParams.get("db"), false);
  const body: Record<string, unknown> = {
    success: true,
    status: "ok",
    app: "nobino-nest",
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    env: nodeEnv(),
    port: Number(process.env.PORT ?? 3100),
    rootDomain: process.env.ROOT_DOMAIN || "localhost",
    cronSecret: Boolean(process.env.CRON_SECRET),
    smsProvider: process.env.SMS_PROVIDER || "mock",
    paymentGateway: process.env.PAYMENT_DEFAULT_GATEWAY || "sandbox",
    servingSpa: spaServingEnabled(),
    timestamp: new Date().toISOString(),
  };
  if (wantDb) body.db = await dbPing();
  return body;
}

/**
 * ثبت میدل‌ورها روی اپ Nest (قبل از listen صدا زده می‌شود تا زودتر از
 * روتر Nest در stack اکسپرس بنشینند).
 *
 * امضا ساختاری و `any` است تا هم `NestExpressApplication` قبول شود و هم
 * هندلرهای خام (req/res/next) بدون جنگ با انواع express رد شوند.
 */
type ExpressLikeApp = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use: (...args: any[]) => any;
  getHttpAdapter: () => { getInstance: () => any };
};

export function registerOpsMiddleware(app: ExpressLikeApp): void {
  const instance = app.getHttpAdapter().getInstance();
  if (!instance || typeof instance.use !== "function") return;

  // ۱) سلامت — همیشه فعال (نیازی به build فرانت ندارد)
  app.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const raw = String(req.url || "");
    const path = raw.split("?")[0];
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (path !== "/api/health" && path !== "/healthz") return next();
    try {
      const body = await healthPayload(req);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(body));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ success: false, status: "error", message: String((err as Error)?.message || err) }));
    }
  });

  const dist = spaDistDir();
  if (!dist || !spaServingEnabled()) return;

  // ۲) فایل‌های استاتیک build فرانت (index: false تا fallback خودمان کار کند)
  const staticMw = express.static(dist, {
    index: false,
    // ریدایرکت serve-static (‎/packages → /packages/) را خاموش می‌کنیم؛ fallback
    // خودمان مستقیم foo/index.html را پیدا و سرو می‌کند (یک دور کمتر).
    redirect: false,
    etag: true,
    lastModified: true,
    fallthrough: true,
    // مسیر سیستم‌عامل را به مسیر URL تبدیل می‌کنیم تا قاعدهٔ کش درست بخورد
    setHeaders: (res: ServerResponse, filePath: string) =>
      setCache(res, "/" + relative(dist, filePath).replace(/\\/g, "/").replace(/^\/+/, "")),
  });
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const raw = String(req.url || "");
    const path = raw.split("?")[0];
    if (RESERVED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    return (staticMw as (r: IncomingMessage, s: ServerResponse, n: () => void) => void)(req, res, next);
  });

  // ۳) fallback اسپا / صفحات prerender شده (`/s/mah/index.html` و ...)
  const shell = join(dist, "index.html");
  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const raw = String(req.url || "");
    const path = (raw.split("?")[0] || "/") as string;
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (RESERVED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next();

    const file = resolveFile(dist, path);
    if (file && extname(file).toLowerCase() === ".html") return sendHtml(req, res, file);
    if (file) return next(); // استاتیکِ موجود در مرحلهٔ قبل سرو شده بود

    const accept = String(req.headers.accept || "");
    const looksLikeAsset = /\.[a-z0-9]{2,6}$/i.test(path);
    if (looksLikeAsset && !/text\/html/i.test(accept)) return next(); // فایل وجود ندارد → ۴۰۴ عادی
    // LO-2: مسیرِ بدون صفحهٔ prerender شده همان shell ریشه را می‌گیرد (canonical «/» + index در بدنه)؛
    // بدنه دست‌نخورده می‌ماند تا روتر کلاینت کار کند، و فقط هدر اعلام می‌کند ایندکس نشود.
    return sendHtml(req, res, shell, true);
  });
}

/** ارسال HTML با هدر درست (HEAD بدنه ندارد) */
function sendHtml(req: IncomingMessage, res: ServerResponse, file: string, noIndex = false) {
  try {
    const html = readFileSync(file, "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    if (noIndex) res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.end(req.method === "HEAD" ? "" : html);
  } catch {
    res.statusCode = 500;
    res.end("index.html not found — build the frontend first (npm run build:frontend)");
  }
}
