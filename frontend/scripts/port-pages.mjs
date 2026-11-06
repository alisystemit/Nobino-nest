/**
 * ابزار بازنشستهٔ مهاجرت Next→Vite: زمانی صفحات pure-client را از src/app
 * به frontend/src/pages کپی می‌کرد. منبع آن (src/app) دیگر وجود ندارد.
 *
 * برای صفحهٔ تازه: مستقیم در frontend/src/pages بسازید (چرخهٔ prerender و
 * STATIC_PAGES در frontend/prerender.mjs منبع حقیقت فهرست صفحات است).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "src", "app");

console.error(
  "port-pages بازنشسته است: src/app وجود ندارد و صفحات مستقیم در frontend/src/pages ساخته می‌شوند." +
    (existsSync(SRC)
      ? "\n(درخت قدیمی src/app هنوز هست؛ در صورت نیاز، ابزار را از تاریخچهٔ گیت بازیابی کنید.)"
      : ""),
);
process.exit(1);
