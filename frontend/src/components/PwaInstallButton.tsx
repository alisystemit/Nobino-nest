"use client";

import { useState } from "react";
import { Check, ChevronDown, Download, Smartphone, X } from "lucide-react";
import { manualInstallSteps, usePwaInstall } from "@/lib/pwa-install";
import { HTTPS_HINT } from "@/lib/browser/capabilities";

/**
 * دکمهٔ «نصب اپ» برای صفحات پنل (رزرو صوتی / رزرو دستی).
 *
 * بنر سراسری `PwaInstall` فقط وقتی ظاهر می‌شود که مرورگر رویداد `beforeinstallprompt`
 * را بفرستد — و آن رویداد روی http هرگز صادر نمی‌شود. این دکمه برعکس عمل می‌کند:
 * همیشه هست، و اگر شرایط نصب فراهم نباشد به‌جای «نصب» راهنمای فارسیِ همان دستگاه
 * (آی‌اواس/اندروید/دسکتاپ) و دلیل فنی را نشان می‌دهد تا کاربر نداند دکمه مرده است.
 */
export default function PwaInstallButton({ className = "" }: { className?: string }) {
  const { support, platform, installed, lastOutcome, install } = usePwaInstall();
  const [openGuide, setOpenGuide] = useState(false);
  const installable = support === "installable";

  /** همان ابعاد و رنگ دکمهٔ «تأیید و ثبت نوبت» — تا نصب اپ چیزی نباشد که چشم کاربر دنبالش بگردد */
  const BTN =
    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.01] active:scale-[0.99]";

  if (installed && !openGuide) {
    return (
      <span className={`${BTN} gap-1.5 border border-emerald-200 bg-gradient-to-l from-emerald-600 to-teal-600 shadow-emerald-500/25 ${className}`}>
        <Check className="h-5 w-5" />
        اپ نوبینو نصب است
      </span>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => (installable ? void install() : setOpenGuide((v) => !v))}
        className={`${BTN} bg-gradient-to-l ${
          installable ? "from-pink-600 to-purple-600" : "from-purple-600 to-indigo-600"
        }`}
        aria-expanded={!installable ? openGuide : undefined}
      >
        {installable ? <Download className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
        نصب اپ نوبینو
        {!installable && <ChevronDown className={`h-4 w-4 transition ${openGuide ? "rotate-180" : ""}`} />}
      </button>

      {openGuide && (
        <div className="absolute left-0 z-40 mt-2 w-80 max-w-[88vw] rounded-2xl border border-neutral-200 bg-white p-4 text-right shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
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
