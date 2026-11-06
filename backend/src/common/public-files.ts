/**
 * سرو امن فایل‌های آپلودی از پوشهٔ `public/`.
 *
 * قبلاً کل پوشهٔ `public` با `useStaticAssets` سرو می‌شد؛ یعنی هر فایلی با هر
 * پسوندی که در آن نوشته می‌شد (حتی `.html`/`.svg`/`.js`) از دامنهٔ اصلی قابل
 * اجرا بود. حالا فقط مسیرهای `/uploads/*` و `/voice/*` و فقط پسوندهای
 * تصویری/صوتی شناخته‌شده سرو می‌شوند، با Content-Type اجباری و `nosniff`.
 */
import express from "express";
import { extname } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mimeForExtension } from "@/lib/upload-validation";

/** فقط این دو مسیر فایل دارند (بقیهٔ public در این پروژه استفاده نمی‌شود) */
const PUBLIC_PREFIXES = ["/uploads/", "/voice/"] as const;

/**
 * پسوندهایی که فقط «برای سرو» مجازند، نه برای آپلود جدید.
 * SVG از نسخه‌های قبلی ممکن است در گالری/لوگوی سالن‌ها مانده باشد؛ چون آپلود
 * جدید SVG بسته شده، فقط همان فایل‌های قدیمی با هدرهای سخت‌گیرانه سرو می‌شوند
 * تا لوگوهای موجود نشکنند (CSP سندباکس اجرای اسکریپت درون SVG را می‌بندد).
 */
const SERVE_ONLY_MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
};

function publicMimeForExtension(ext: string): string | null {
  return mimeForExtension(ext) ?? SERVE_ONLY_MIME[String(ext).toLowerCase()] ?? null;
}

type ExpressLikeApp = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  use: (...args: any[]) => any;
  getHttpAdapter: () => { getInstance: () => any };
};

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function registerPublicFiles(app: ExpressLikeApp, root: string): void {
  const instance = app.getHttpAdapter().getInstance();
  if (!instance || typeof instance.use !== "function") return;

  const staticMw = express.static(root, {
    index: false,
    dotfiles: "deny",
    redirect: false,
    fallthrough: true,
    etag: true,
    lastModified: true,
    setHeaders: (res: ServerResponse, filePath: string) => {
      const mime = publicMimeForExtension(extname(filePath));
      // Content-Type را خودمان تعیین می‌کنیم تا هرگز از محتوا/نام حدس زده نشود
      if (mime) res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      // اگر مرورگر روزی این فایل را به‌جای تصویر/صدا به‌عنوان سند باز کند،
      // هیچ اسکریپت/منبع خارجی اجرا نمی‌شود.
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.setHeader("Cross-Origin-Resource-Policy", "same-site");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  });

  app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const pathname = String(req.url || "").split("?")[0];
    if (!isPublicPath(pathname)) return next();

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end();
      return;
    }

    // فقط پسوندهای شناخته‌شده — HTML/JS/JSON و هر پسوند ناشناخته مسدود می‌شود.
    // SVG قدیمی با CSP سندباکس سرو می‌شود، ولی آپلود جدید SVG در API بسته است.
    if (!publicMimeForExtension(extname(pathname))) {
      res.statusCode = 404;
      res.end();
      return;
    }

    return (staticMw as unknown as (r: IncomingMessage, s: ServerResponse, n: () => void) => void)(req, res, next);
  });
}
