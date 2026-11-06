import { loadEnvFiles } from "@/compat/load-env";

// .env باید پیش از import هر ماژولی که env را می‌خواند (lib/env.ts) بار شود
loadEnvFiles();

import "reflect-metadata";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { HttpErrorFilter } from "@/common/filters/http-error.filter";
import { registerOpsMiddleware } from "@/common/ops-middleware";
import { registerPublicFiles } from "@/common/public-files";
import { requestStore } from "@/compat/request-context";
import { AppModule } from "@/app.module";
import { isDevelopmentEnv, productionEnvErrors } from "@/lib/env";
import { codesAllowedInProduction } from "@/lib/auth/code-display";

/**
 * مبدأ «fail-closed»: اگر `CORS_ORIGIN` ست نشده باشد، فقط در محیط توسعهٔ صریح
 * چند origin محلی مجازند؛ در production هیچ cross-origin مجاز نیست (درخواست‌های
 * same-origin بدون CORS کار می‌کنند). قبلاً پیش‌فرض `true` بود و هر سایتی با
 * کوکی کاربر می‌توانست درخواست بزند.
 */
function corsOrigins(): string[] | false {
  const raw = (process.env.CORS_ORIGIN ?? "").trim();
  if (raw) {
    const list = raw
      .split(",")
      .map((value) => value.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    return list.length ? list : false;
  }
  if (isDevelopmentEnv()) {
    return [
      "http://localhost:5175",
      "http://127.0.0.1:5175",
      "http://localhost:3100",
      "http://127.0.0.1:3100",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ];
  }
  return false;
}

function parseCookies(header?: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1) map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  return map;
}

async function bootstrap() {
  // محافظ محیط production: با JWT پیش‌فرض یا callback لوکال اپ را بالا نیاور
  const envErrors = productionEnvErrors();
  if (process.env.NODE_ENV === "production" && envErrors.length) {
    console.error("⛔ تنظیمات محیط production ناقص است:\n - " + envErrors.join("\n - "));
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // هندلرها خودشان بدنه خام را به Request استاندارد تبدیل می‌کنند
    bodyParser: false,
    logger: ["log", "warn", "error"],
  });

  // Nginx جلوی اپ قرار می‌گیرد؛ اعتماد به پروکسی برای x-forwarded-* لازم است
  app.getHttpAdapter().getInstance()?.set?.("trust proxy", 1);

  // هدرهای امنیتی پایه برای همهٔ پاسخ‌ها (بدون X-Frame-Options تا embed مجاز بماند)
  app.use((_req: any, res: any, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // فایل‌های آپلودی/استاتیک محلی — فقط پسوندهای تصویری/صوتی و با Content-Type اجباری.
  // (در تولید Nginx هم می‌تواند این‌ها را سرو کند؛ این خط برای dev و parity با Next است.)
  registerPublicFiles(app, join(process.cwd(), "public"));

  const origins = corsOrigins();
  app.enableCors({
    origin: origins,
    credentials: origins !== false,
  });
  if (origins === false) {
    console.warn(
      "⚠️ CORS: هیچ origin مجاز تعریف نشده (CORS_ORIGIN خالی است)؛ فقط درخواست‌های same-origin پذیرفته می‌شوند.",
    );
  }
  if (codesAllowedInProduction()) {
    console.warn(
      "⚠️ امنیت: OTP_DISPLAY_ALLOW_PRODUCTION=true در production؛ کد تأیید از API عمومی قابل خواندن است. فقط برای تست موقت.",
    );
  }

  // مقداردهی بافت درخواست (AsyncLocalStorage) برای هر درخواست — تا `cookies()`/`requireRole`
  // در کنترلرهای Nest هم همانند Route Handlerهای قدیمی کار کنند.
  app.use((req: any, res: any, next: () => void) => {
    const proto = req.protocol || String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    const host = req.headers.host || "localhost";
    const url = `${proto}://${host}${req.originalUrl || req.url}`;
    const ctx = {
      request: new Request(url, { method: req.method, headers: req.headers }),
      params: {},
      nodeRes: res,
      requestCookies: parseCookies(req.headers.cookie),
      cookieChanges: new Map<string, { name: string; value: string }>(),
    };
    requestStore.run(ctx as any, () => next());
  });

  app.useGlobalFilters(new HttpErrorFilter());

  // پروداکشن/PaaS: `/api/health` + سرو frontend/dist در همین پورت (اگر build باشد).
  // در dev که Vite روی ۵۱۷۵ هست، فایل index.html در frontend/dist نیست و این
  // میدل‌ور خودش خاموش می‌ماند. با SPA_DISABLED=1 یا SERVE_FRONTEND=0 غیرفعال می‌شود.
  registerOpsMiddleware(app);

  const port = Number(process.env.PORT ?? 3100);
  const host = process.env.HOST ?? "0.0.0.0";
  await app.listen(port, host);
  // eslint-disable-next-line no-console
  console.log(`Nobino API (NestJS) در حال اجرا روی ${host}:${port}`);
}

bootstrap();
