/**
 * نصب «اپ» از داخل مینی‌اپ — نسخهٔ مستقل از lib/pwa-install سایت.
 *
 * ماژول /mini عمداً هیچ اجزای سایت را import نمی‌کند، پس این فایل همان کار را
 * با کمترین وابستگی انجام می‌دهد: ثبت سرویس‌ورکر، گرفتن رویداد
 * `beforeinstallprompt`، تشخیص دستگاه، و پرچم «قبلاً نصب شده».
 * نکتهٔ مهم: دکمهٔ نصب هیچ‌وقت به `beforeinstallprompt` گره نمی‌خورد — اگر
 * مرورگر اجازهٔ نصب خودکار نداد، همان دکمه مراحل دستیِ فارسی را نشان می‌دهد.
 */
import { useCallback, useEffect, useState } from "react";

export type MiniInstallDevice = "ios" | "android" | "desktop";

/**
 * installable : مرورگر دیالوگ native دارد
 * manual      : نصب دستی لازم است (iOS، HTTP، یا هنوز اجازه نشده)
 * installed   : همین حالا در حالت مستقل اجرا می‌شود
 */
export type MiniInstallSupport = "installable" | "manual" | "installed";

export type MiniInstallOutcome = "accepted" | "dismissed" | "manual" | null;

export type MiniInstallState = {
  support: MiniInstallSupport;
  device: MiniInstallDevice;
  installed: boolean;
  /** روی HTTP خالص نه نصب ممکن است نه سرویس‌ورکر */
  secureContext: boolean;
  /** نتیجهٔ آخرین کلیک روی «نصب» */
  lastOutcome: MiniInstallOutcome;
  /** نصب native؛ اگر ممکن نبود "manual" برمی‌گرداند تا راهنما باز شود */
  install: () => Promise<MiniInstallOutcome>;
};

type PromptableEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** رویداد نصب فقط یک بار در عمر صفحه می‌آید؛ این متغیر آن را برای همهٔ کامپوننت‌ها نگه می‌دارد */
let cachedPrompt: PromptableEvent | null = null;
const promptListeners = new Set<(e: PromptableEvent | null) => void>();

let swRegistered = false;
function registerServiceWorker() {
  if (swRegistered || typeof navigator === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  swRegistered = true;
  // خطای ثبت (مثلاً HTTP) نباید جریان مینی‌اپ را بشکند
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function detectDevice(): MiniInstallDevice {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return Boolean((navigator as unknown as { standalone?: boolean }).standalone);
}

/** راهنمای گام‌به‌گامِ نصب دستی، به تفکیک دستگاه */
export function miniInstallSteps(device: MiniInstallDevice, brand: string): string[] {
  if (device === "ios") {
    return [
      "این صفحه را در Safari باز کنید.",
      "روی علامت اشتراک (مربع با فلش رو به بالا) بزنید.",
      `«افزودن به صفحهٔ اصلی» را انتخاب کنید تا ${brand} کنار آیکون‌های شما نصب شود.`,
    ];
  }
  if (device === "android") {
    return [
      "در Chrome روی منوی ⋮ (سه‌نقطه) بزنید.",
      "«افزودن به صفحهٔ اصلی» یا «Install app» را انتخاب کنید.",
      "اگر گزینه نیست، آدرس را با https باز کنید.",
    ];
  }
  return [
    "در نوار آدرس روی علامت نصب (مربع با فلش) کلیک کنید.",
    "یا از منوی ⋮ مسیر «Save and share ← Install page» را بروید.",
    "اگر گزینهٔ نصب نیست، آدرس را با https باز کنید.",
  ];
}

export function useMiniInstall(): MiniInstallState {
  const [deferred, setDeferred] = useState<PromptableEvent | null>(cachedPrompt);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [lastOutcome, setLastOutcome] = useState<MiniInstallOutcome>(null);

  useEffect(() => {
    registerServiceWorker();
    let active = true;

    const publish = (e: PromptableEvent | null) => {
      cachedPrompt = e;
      for (const fn of promptListeners) fn(e);
    };
    const onPrompt = (e: Event) => {
      e.preventDefault();
      publish(e as PromptableEvent);
    };
    const onInstalled = () => {
      if (!active) return;
      setInstalled(true);
      publish(null);
    };

    // هر کامپوننت تابع خودش را ثبت می‌کند تا رویداد نصب به همه برسد
    const listener = (e: PromptableEvent | null) => {
      if (active) setDeferred(e);
    };
    promptListeners.add(listener);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const standaloneMq = window.matchMedia("(display-mode: standalone)");
    const onStandalone = () => {
      if (active && standaloneMq.matches) setInstalled(true);
    };
    standaloneMq.addEventListener("change", onStandalone);

    return () => {
      active = false;
      promptListeners.delete(listener);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      standaloneMq.removeEventListener("change", onStandalone);
    };
  }, []);

  const secureContext = typeof window !== "undefined" ? Boolean(window.isSecureContext) : false;
  const device = detectDevice();

  const install = useCallback(async (): Promise<MiniInstallOutcome> => {
    if (!deferred) {
      setLastOutcome("manual");
      return "manual";
    }
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      const outcome: MiniInstallOutcome = choice.outcome === "accepted" ? "accepted" : "dismissed";
      if (outcome === "accepted") setInstalled(true);
      setLastOutcome(outcome);
      cachedPrompt = null;
      setDeferred(null);
      return outcome;
    } catch {
      setLastOutcome("manual");
      return "manual";
    }
  }, [deferred]);

  const support: MiniInstallSupport = installed ? "installed" : deferred ? "installable" : "manual";

  return { support, device, installed, secureContext, lastOutcome, install };
}

/* ── پنهان‌کردن شیت بعد از «فعلاً نه» ─────────────────────────────── */

const DISMISS_KEY = "nobino.mini.installDismiss";
const REASK_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function installDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < REASK_AFTER_MS;
  } catch {
    return false;
  }
}

export function markInstallDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* حالت خصوصی مرورگر */
  }
}

export function clearInstallDismissal(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* بی‌اثر */
  }
}

/**
 * اگر کاربر از همین‌جا نصب کرد، اپِ نصب‌شده به جای صفحهٔ marketing مستقیم
 * مینی‌اپ را باز کند (App.tsx این کلید را در حالت standalone می‌خواند).
 */
export function rememberMiniLaunchPath(): void {
  try {
    localStorage.setItem("nobino.launchPath", "/mini");
  } catch {
    /* بی‌صدا */
  }
}

/* ── درخواست باز کردن شیت (دکمهٔ «نصب اپ» در صفحهٔ «حساب من») ──────── */

const sheetListeners = new Set<() => void>();

export function requestMiniInstallSheet(): void {
  for (const fn of sheetListeners) fn();
}

/** شیت فقط یک‌جا (پوستهٔ مینی‌اپ) رندر می‌شود؛ بقیهٔ صفحات با این درخواست بازش می‌کنند */
export function onMiniInstallSheetRequested(open: () => void): () => void {
  sheetListeners.add(open);
  return () => {
    sheetListeners.delete(open);
  };
}
