import { loadEnvFiles } from "@/compat/load-env";

// .env باید پیش از import هر ماژولی که env را می‌خواند (lib/env.ts) بار شود
loadEnvFiles();

import "reflect-metadata";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { HttpErrorFilter } from "@/common/filters/http-error.filter";
import { registerOpsMiddleware } from "@/common/ops-middleware";
import { requestStore } from "@/compat/request-context";
import { AppModule } from "@/app.module";
import { productionEnvErrors } from "@/lib/env";

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

  // فایل‌های آپلودی/استاتیک محلی (در تولید Nginx این‌ها را سرور می‌کند؛ این خط برای dev و parity با Next است)
  app.useStaticAssets(join(process.cwd(), "public"));

  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true,
  });

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
