/**
 * ابزار بازنشستهٔ مهاجرت Next→Nest: زمانی routeهای src/app/api را به
 * backend/src/routes پورت می‌کرد و manifest.json را بازنویسی می‌نمود.
 *
 * منبع آن (src/app/api) دیگر وجود ندارد و مانیفست اکنون دستی نگه‌داری
 * می‌شود (منبع حقیقت). این اسکریپت عمداً فقط پیام می‌دهد و خارج می‌شود تا
 * اجرای تصادفی، manifest.json دستی‌اصلاح‌شده را نابود نکند.
 *
 * مسیر تازه: فایل route را در backend/src/routes بسازید، ورودی‌اش را به
 * backend/src/routes/manifest.json اضافه کنید، سپس:
 *   node backend/scripts/gen-controllers.mjs
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const API_SRC = join(ROOT, "src", "app", "api");

console.error(
  "port-routes بازنشسته است و manifest.json دیگر با آن بازنویسی نمی‌شود.\n" +
    "مسیر تازه: فایل route را در backend/src/routes بسازید، ورودی‌اش را به\n" +
    "backend/src/routes/manifest.json اضافه کنید و «node backend/scripts/gen-controllers.mjs» را اجرا کنید." +
    (existsSync(API_SRC)
      ? "\n(درخت قدیمی src/app/api هنوز هست؛ در صورت نیاز به مهاجرت، ابزار را از تاریخچهٔ گیت بازیابی کنید.)"
      : ""),
);
process.exit(1);
