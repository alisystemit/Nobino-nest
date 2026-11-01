"use client";

import { useState } from "react";
import { Check, ChevronDown, Download, Smartphone, X } from "lucide-react";
import { manualInstallSteps, usePwaInstall } from "@/lib/pwa-install";
import { HTTPS_HINT } from "@/lib/browser/capabilities";
import { subdomainUrl } from "@/lib/subdomain";

/**
 * دکمهٔ شناورِ نصب اپ — ثابت در سمت چپ صفحهٔ سالن.
 *
 * با یک کلیک:
 *  - اندروید/دسکتاپ: دیالوگ نصبِ مرورگر باز می‌شود و میانبر روی گوشی/سیستم ساخته
 *    می‌شود (فرم ساب‌دامین: http://mah.localhost:5175/).
 *  - iOS/Safari: مرورگر اجازهٔ نصب خودکار نمی‌دهد؛ بنابراین راهنمای فارسیِ «افزودن به
 *    صفحه اصلی» نمایش داده می‌شود.
 */
export default function FloatingInstallButton({ slug, className = "" }: { slug: string; className?: string }) {
  const { support, platform, installed, lastOutcome, install } = usePwaInstall();
  const [openGuide, setOpenGuide] = useState(false);
  const installable = support === "installable";
  const launchPath = subdomainUrl(slug);

  async function handleInstall() {
    const outcome = await install();
    if (outcome === "accepted") {
      // تا اپِ نصب‌شده (و نه وب معمولی) صفحهٔ همان سالن را با فرم ساب‌دامین باز کند
      try {
        localStorage.setItem("nobino.launchPath", launchPath);
      } catch {
        /* بی‌صدا */
      }
    }
  }

  const BTN =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-xl transition hover:scale-[1.03] active:scale-[0.97]";

  if (installed && !openGuide) {
    return (
      <div className={`fixed left-3 top-1/2 z-50 -translate-y-1/2 ${className}`}>
        <span className={`${BTN} gap-1.5 border border-emerald-200 bg-gradient-to-l from-emerald-600 to-teal-600 shadow-emerald-500/25`}>
          <Check className="h-5 w-5" />
          نصب شد
        </span>
      </div>
    );
  }

  return (
    <div className={`fixed left-3 top-1/2 z-50 flex -translate-y-1/2 flex-col items-start gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => (installable ? void handleInstall() : setOpenGuide((v) => !v))}
        className={`${BTN} bg-gradient-to-l ${
          installable ? "from-pink-600 to-purple-600" : "from-purple-600 to-indigo-600"
        }`}
        aria-expanded={!installable ? openGuide : undefined}
      >
        {installable ? <Download className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
        نصب اپ
        {!installable && <ChevronDown className={`h-4 w-4 transition ${openGuide ? "rotate-180" : ""}`} />}
      </button>

      {openGuide && (
        <div className="w-80 max-w-[88vw] rounded-2xl border border-neutral-200 bg-white p-4 text-right shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-black text-neutral-900 dark:text-neutral-100">
              {support === "insecure" ? "چرا دکمهٔ نصب غیرفعال است؟" : "نصب دستی اپ نوبینو"}
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
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pink-50 text-[10px] font-black text-pink-600 dark:bg-pink-900/40 dark:text-pink-300">
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
        </div>
      )}
    </div>
  );
}
