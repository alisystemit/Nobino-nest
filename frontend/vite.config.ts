import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const API_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:3100";

export default defineConfig({
  // متغیرهای VITE_* از .env ریشهٔ مخزن خوانده می‌شوند (یک فایل env برای هر دو سمت).
  // اگر `frontend/.env` بسازید، Vite آن را هم در نظر می‌گیرد؛ مقدار process.env
  // در زمان build اولویت دارد.
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
