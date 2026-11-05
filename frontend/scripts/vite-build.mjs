/**
 * `vite build` را با NODE_ENV=production اجرا می‌کند.
 *
 * چرا لازم است: .env ریشهٔ مخزن `NODE_ENV="development"` دارد (بک‌اند آن را برای
 * حالت توسعه می‌خواهد) و `envDir` در vite.config.ts همان پوشه را به Vite می‌دهد.
 * Vite مقدار NODE_ENV را از فایل env برمی‌دارد و «توسعه‌ای» build می‌کند: راکتِ
 * development با jsx-dev-runtime درون dist. اثرش روی نوبینو سنجیده شد:
 *   - بسترهٔ ورودی: 735 kB به‌جای 435 kB (gzip 128 kB)
 *   - افکت‌های useEffect در StrictMode دو بار اجرا می‌شوند (دو برابر درخواست API)
 *   - هشدارهای کنسول و کند بودن Reconciler برای کاربر واقعی
 * ست‌کردن NODE_ENV داخل vite.config.ts فایده‌ای ندارد — Vite بعد از خواندن کانفیگ،
 * حالت build را از نو از همان فایل env می‌خواند. تنها راهِ مطمئن، ست‌کردن متغیر در
 * همان پروسه‌ای است که Vite را صدا می‌زند؛ پس `npm run build` این اسکریپت را اجرا
 * می‌کند.
 */
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "production";

const { build } = await import("vite");

await build({
  configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
  mode: "production",
  logLevel: "info",
});
