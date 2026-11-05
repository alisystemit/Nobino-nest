import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/vazirmatn/index.css";
/* وزن‌های واقعی Vazirmatn.
   Yekan هیچ حرف و رقم لاتینی ندارد، پس هر کاراکتر لاتینِ وسط یک رشتهٔ فارسی
   (رقم، دامنه، نام انگلیسی) از Vazirmatn رندر می‌شود. وقتی فقط وزن 400 آن
   موجود باشد، مرورگر برای متن‌های font-medium/semibold/bold/extrabold
   ضخیم‌سازی مصنوعی می‌کند: حرف‌ها سایه‌دار و ناهم‌قد می‌شوند و با حروف فارسیِ
   هم‌خط نمی‌خوانند. این فایل‌ها همان وزن‌ها را واقعی می‌کنند. */
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "@fontsource/vazirmatn/800.css";
import "./globals.css";
import { App } from "./App";

// رجیستری سرویس‌ورکر PWA (همان رفتار components/PwaInstall)
const root = document.getElementById("root");
if (!root) throw new Error("root missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
