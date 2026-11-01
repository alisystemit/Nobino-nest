"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** ثبت سرویس‌ورکر + دکمه هوشمند نصب اپلیکیشن (PWA) */
export default function PwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // ثبت سرویس‌ورکر
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // شناسایی iOS برای راهنمای نصب دستی (Safari از beforeinstallprompt پشتیبانی نمی‌کند)
    Promise.resolve().then(() => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
      setIsIOS(ios && !window.matchMedia("(display-mode: standalone)").matches);
    });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    } else {
      setDismissed(true);
    }
    setDeferred(null);
  }

  if (installed) return null;
  if (!deferred && !isIOS) return null;
  if (dismissed) return null;

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-80">
      <div className="flex items-center gap-3 rounded-2xl border border-pink-200 bg-white/95 p-3 shadow-2xl shadow-pink-500/20 backdrop-blur dark:border-pink-900/50 dark:bg-neutral-900/95">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="نوبینو" className="h-10 w-10 rounded-xl" />
        <div className="flex-1">
          <p className="text-xs font-black text-neutral-900 dark:text-neutral-100">اپلیکیشن نوبینو را نصب کنید</p>
          {isIOS ? (
            <p className="mt-0.5 text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">
              در Safari: دکمه اشتراک‌گذاری ← «افزودن به صفحه اصلی»
            </p>
          ) : (
            <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">دسترسی سریع + کارکرد آفلاین</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {!isIOS && (
            <button
              onClick={install}
              className="flex h-10 items-center justify-center rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-4 text-xs font-black text-white shadow transition hover:opacity-95 active:scale-95"
            >
              نصب
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            aria-label="بستن"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xs text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
