import { loadEnvFiles } from "@/compat/load-env";

// .env باید پیش از import هر ماژولی که env را می‌خواند (lib/env.ts) بار شود
loadEnvFiles();

import "reflect-metadata";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "@/app.module";

async function bootstrap() {
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

  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`Nobino API (NestJS) در حال اجرا روی پورت ${port}`);
}

bootstrap();
