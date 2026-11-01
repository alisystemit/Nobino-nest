"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Smartphone, X } from "lucide-react";
import { manualInstallSteps, usePwaInstall } from "@/lib/pwa-install";
import { HTTPS_HINT } from "@/lib/browser/capabilities";
import { subdomainUrl } from "@/lib/subdomain";
import SafeImage from "@/components/SafeImage";

/**
 * بنر نصب اپلیکیشنِ همان سالن — یک‌کلیک و اختصاصی:
 * - اندروید/دسکتاپِ قابل‌نصب: «نصب» مستقیم دیالوگ native مرورگر را باز می‌کند
 *   و میانبر ساخته می‌شود؛ باز کردنش صفحهٔ همان سالن (فرم ساب‌دامین) را می‌گشاید.
 * - iOS یا حالت‌هایی که مرورگر هنوز اجازهٔ نصب خودکار نمی‌دهد (HTTP، engagement
 *   کامل نشده): همان دکمه، راهنمای فارسیِ گام‌به‌گامِ همان دستگاه را باز می‌کند —
 *   تا دکمه هیچ‌وقت مرده یا غایب نباشد.
 */
export default function SalonInstallBanner({
  slug,
  name,
  logoUrl,
}: {
  slug: string;
  name: string;
  logoUrl?: string | null;
}) {
  const { support, platform, installed, lastOutcome, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [openGuide, setOpenGuide] = useState(false);
  const installable = support === "installable";

  async function handleInstall() {
    if (!installable) {
      setOpenGuide((v) => !v);
      return;
    }
    const outcome = await install();
    if (outcome === "accepted") {
      // تا اپِ نصب‌شده (و نه وب معمولی) صفحهٔ همان سالن را باز کند
      try {
        localStorage.setItem("nobino.launchPath", subdomainUrl(slug));
      } catch {
        /* بی‌صدا */
      }
    }
  }

  if (installed || dismissed) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[23rem]">
      <AnimatePresence>
        {openGuide && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mb-3 rounded-3xl border border-neutral-200/80 bg-white/95 p-4 text-right shadow-2xl backdrop-blur-xl dark:border-neutral-700/80 dark:bg-neutral-900/95"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-black text-neutral-900 dark:text-neutral-100">
                {support === "insecure" ? "چرا نصب خودکار فعال نیست؟" : `افزودن «${name}» به صفحهٔ اصلی`}
              </p>
              <button
                type="button"
                onClick={() => setOpenGuide(false)}
                aria-label="بستن راهنما"
                className="text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {support === "insecure" && (
              <p className="mt-2 text-[11px] leading-5 text-amber-700 dark:text-amber-300">{HTTPS_HINT}</p>
            )}

            <ol className="mt-3 space-y-2 text-[11px] leading-5 text-neutral-600 dark:text-neutral-300">
              {manualInstallSteps(platform).map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-[10px] font-black text-white">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>

            {lastOutcome === "dismissed" && (
              <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                درخواست نصب بسته شد. هر وقت خواستید دوباره امتحان کنید.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* خودِ بنر — قاب گرادیانی شیشه‌ای */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.6, ease: "easeOut" }}
        className="rounded-3xl bg-gradient-to-l from-pink-500 via-fuchsia-500 to-purple-600 p-[1.5px] shadow-2xl shadow-pink-500/30"
      >
        <div className="flex items-center gap-3 rounded-[calc(1.5rem-1.5px)] bg-white/95 p-3 backdrop-blur-xl dark:bg-neutral-900/95">
          <div className="relative shrink-0">
            <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 opacity-70 blur-[2px]" />
            <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white text-2xl dark:bg-neutral-800">
              <SafeImage
                src={logoUrl ?? ""}
                alt={name}
                className="h-full w-full object-cover"
                fallback="✂️"
                fallbackClassName="flex h-full w-full items-center justify-center text-2xl"
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-black text-neutral-900 dark:text-neutral-100">
              اپلیکیشن «{name}» را نصب کنید
            </p>
            <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
              {support === "manual-ios"
                ? "Safari: اشتراک ← «افزودن به صفحهٔ اصلی»"
                : "دسترسی سریع + نوبت آنلاین آفلاین"}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => void handleInstall()}
              aria-expanded={!installable ? openGuide : undefined}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 px-4 text-xs font-black text-white shadow-lg shadow-pink-500/30 transition hover:scale-[1.04] hover:shadow-pink-500/40 active:scale-95"
            >
              {installable ? <Download className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
              نصب
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="بستن"
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            >
              ✕
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
