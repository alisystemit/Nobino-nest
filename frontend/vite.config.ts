import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const API_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:3100";

export default defineConfig({
  // متغیرهای VITE_* از .env ریشهٔ مخزن خوانده می‌شوند (یک فایل env برای هر دو سمت).
  // اگر `frontend/.env` بسازید، Vite آن را هم در نظر می‌گیرد؛ مقدار process.env
  // در زمان build اولویت دارد.
  // هشدار: همین envDir باعث می‌شود `NODE_ENV="development"`ِ فایل ریشه حالت build را
  // هم عوض کند و راکتِ development داخل dist بنشیند (بسترهٔ 735 kB به‌جای 435 kB و دو
  // بار اجرای افکت‌ها). تله را ./scripts/vite-build.mjs رفع می‌کند و `npm run build`
  // همان را صدا می‌زند؛ اگر مستقیم `vite build` اجرا می‌کنید، بیرون از Vite
  // NODE_ENV=production بگذارید.
  envDir: fileURLToPath(new URL("..", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5175,
    // ساب‌دامین‌های لوکال (mah.localhost) هم باید پذیرفته شوند؛ Vite به‌طور
    // پیش‌فرض فقط localhost/127.x را می‌پذیرد.
    host: true,
    allowedHosts: [".localhost", "localhost"],
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true, xfwd: true },
      "/uploads": { target: API_TARGET, changeOrigin: true, xfwd: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
