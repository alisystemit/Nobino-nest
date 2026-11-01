import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/vazirmatn/index.css";
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
