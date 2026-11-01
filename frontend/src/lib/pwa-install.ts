"use client";

/**
 * وضعیت نصب اپلیکیشن (PWA) — منطق مشترک بنر سراسری و دکمهٔ «نصب اپ».
 *
 * مرورگر فقط وقتی اجازهٔ نصب می‌دهد که:
 * ۱) صفحه در بستر امن باشد (HTTPS یا localhost) و ۲) سرویس‌ورکر + منیفست کامل باشد
 * و ۳) رویداد `beforeinstallprompt` پیش از این خورده باشد. Safari آی‌اواس آن رویداد
 * را اصلاً ندارد و نصبش دستی است (اشتراک ← «افزودن به صفحهٔ اصلی»).
 * برای همین همهٔ این حالت‌ها اینجا به یک وضعیت واحد (`support`) تبدیل می‌شوند تا
 * کامپوننت‌ها فقط پیام فارسی را نمایش دهند.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type PromptableEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaPlatform = "ios" | "android" | "desktop";
export type PwaSupport = "installable" | "installed" | "manual-ios" | "insecure" | "unavailable";

export type PwaInstallState = {
  support: PwaSupport;
  platform: PwaPlatform;
  /** آیا صفحه در بستر امن است؛ روی HTTP خالص میکروفون و نصب هر دو غیرفعال‌اند */
  secureContext: boolean;
  installed: boolean;
  /** نتیجهٔ آخرین درخواست نصب */
  lastOutcome: "accepted" | "dismissed" | "unavailable" | null;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

/** سرویس‌ورکر باید فقط یک بار در عمر صفحه ثبت شود */
let swRegistered = false;
function registerServiceWorker() {
  if (swRegistered || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  swRegistered = true;
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* ثبت ناموفق نباید جریان اصلی را بشکند */
  });
}

function detectPlatform(): PwaPlatform {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
  return Boolean((navigator as unknown as { standalone?: boolean }).standalone);
}

/** وضعیت محیط مرورگر که برای نصب لازم است؛ یک‌بار خوانده و کش می‌شود (در عمر صفحه ثابت است) */
type PwaEnv = { platform: PwaPlatform; secureContext: boolean; standalone: boolean };

const SERVER_ENV: PwaEnv = { platform: "desktop", secureContext: false, standalone: false };
let envCache: PwaEnv | null = null;

function getEnvSnapshot(): PwaEnv {
  if (!envCache) {
    envCache = { platform: detectPlatform(), secureContext: Boolean(window.isSecureContext), standalone: isStandalone() };
  }
  return envCache;
}

function subscribeEnv(onChange: () => void): () => void {
  const recheck = () => {
    envCache = null;
    onChange();
  };
  const mqs = ["(display-mode: standalone)", "(display-mode: window-controls-overlay)"].map((q) => window.matchMedia(q));
  mqs.forEach((mq) => mq.addEventListener("change", recheck));
  window.addEventListener("appinstalled", recheck);
  return () => {
    mqs.forEach((mq) => mq.removeEventListener("change", recheck));
    window.removeEventListener("appinstalled", recheck);
  };
}

export function usePwaInstall(): PwaInstallState {
  const env = useSyncExternalStore(subscribeEnv, getEnvSnapshot, () => SERVER_ENV);
  const [deferred, setDeferred] = useState<PromptableEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<PwaInstallState["lastOutcome"]>(null);

  useEffect(() => {
    registerServiceWorker();
    let active = true;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (active) setDeferred(e as PromptableEvent);
    };
    const onInstalled = () => {
      if (!active) return;
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      active = false;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferred) {
      setLastOutcome("unavailable");
      return "unavailable";
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    const outcome = choice.outcome === "accepted" ? "accepted" : "dismissed";
    setLastOutcome(outcome);
    if (outcome === "accepted") setInstalled(true);
    setDeferred(null);
    return outcome;
  }, [deferred]);

  const support: PwaSupport =
    installed || env.standalone
      ? "installed"
      : deferred
        ? "installable"
        : !env.secureContext
          ? "insecure"
          : env.platform === "ios"
            ? "manual-ios"
            : "unavailable";

  return { support, platform: env.platform, secureContext: env.secureContext, installed: installed || env.standalone, lastOutcome, install };
}

/** راهنمای فارسی نصب دستی، به تفکیک دستگاه */
export function manualInstallSteps(platform: PwaPlatform): string[] {
  if (platform === "ios") {
    return [
      "در Safari روی علامت اشتراک (مربع با فلش رو به بالا) بزنید.",
      "گزینهٔ «افزودن به صفحه اصلی» (Add to Home Screen) را انتخاب کنید.",
      "اپ با نام «نوبینو» کنار آیکون‌های شما ساخته می‌شود.",
    ];
  }
  if (platform === "android") {
    return [
      "در Chrome روی منوی ⋮ (سه‌نقطه) بزنید.",
      "گزینهٔ «افزودن به صفحه اصلی» یا «Install app» را انتخاب کنید.",
      "اگر این گزینه نیست، آدرس را با https باز کنید (نکتهٔ پایین را ببینید).",
    ];
  }
  return [
    "در نوار آدرس Chrome روی علامت نصب (مربع با فلش) کلیک کنید.",
    "یا از منوی ⋮ مسیر «Save and share → Install page» را بروید.",
    "اگر گزینهٔ نصب نیست، آدرس را با https باز کنید (نکتهٔ پایین را ببینید).",
  ];
}
