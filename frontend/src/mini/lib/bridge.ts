/**
 * پل مینی‌اپ با پیام‌رسان‌ها — تلگرام، بله، ایتا و وایتا.
 *
 * هر چهار پیام‌رسان یک شیء سراسری شبهمانی دارند؛ این ماژول همان را می‌یابد و
 * «آماده/تمام‌صفحه» می‌کند، رنگ زمینه را می‌گیرد، و رشتهٔ `initData` را برای
 * ورود بی‌حس بیرون می‌کشد. اگر بیرون از پیام‌رسان باز شده باشد (مرورگر عادی)،
 * همهٔ توابع بی‌خطر مقدار خالی برمی‌گردانند.
 */

export type MiniPlatformId = "telegram" | "bale" | "eitaa" | "wita" | "web";

type WebAppLike = {
  ready?: () => void;
  expand?: () => void;
  initData?: string;
  initDataUnsafe?: { user?: { id?: number | string; username?: string; first_name?: string; photo_url?: string } };
  colorScheme?: string;
  platform?: string;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  HapticFeedback?: { impactOccurred?: (s: string) => void };
  BackButton?: { isVisible?: boolean; show?: () => void; hide?: () => void; onClick?: (cb: () => void) => void; offClick?: (cb: () => void) => void };
  onClose?: (cb: () => void) => void;
  viewport?: { setExpanded?: (v: boolean) => void };
};

type WindowWithBridges = Window & {
  Telegram?: { WebApp?: WebAppLike };
  Bale?: { WebApp?: WebAppLike };
  Eitaa?: { WebApp?: WebAppLike };
  Wita?: { WebApp?: WebAppLike };
};

/** یافتن شیء WebApp بدون توجه به پیام‌رسان */
function rawWebApp(): WebAppLike | null {
  if (typeof window === "undefined") return null;
  const w = window as WindowWithBridges;
  return w.Telegram?.WebApp ?? w.Bale?.WebApp ?? w.Eitaa?.WebApp ?? w.Wita?.WebApp ?? null;
}

/**
 * تشخیص پلتفرم. اول از شیء سراسری، سپس از UA/میزبان:
 * تلگرام و بله هر دو `Telegram/WebApp` را تزریق می‌کنند؛ بله خودش را با
 * `platform` یا UA مشخص می‌کند، پس بعد از آن نگاه می‌کنیم.
 */
export function detectPlatform(): MiniPlatformId {
  if (typeof window === "undefined") return "web";
  const w = window as WindowWithBridges;
  const ua = (navigator.userAgent || "").toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const forced = (params.get("mp") || "").trim().toLowerCase();
  if (forced === "telegram" || forced === "bale" || forced === "eitaa" || forced === "wita") return forced;

  if (w.Bale?.WebApp || ua.includes("bale")) return "bale";
  if (w.Eitaa?.WebApp || ua.includes("eitaa") || ua.includes("aita")) return "eitaa";
  if (w.Wita?.WebApp || ua.includes("wita")) return "wita";
  if (w.Telegram?.WebApp || ua.includes("telegram")) return "telegram";
  // برخی وب‌ویوها فقط پارامترهای تلگرام‌مانند را در URL می‌گذارند
  if (params.has("initData") || params.has("tgWebAppVersion") || ua.includes("webview")) return "telegram";
  return "web";
}

export const PLATFORM_LABEL: Record<MiniPlatformId, string> = {
  telegram: "تلگرام",
  bale: "بله",
  eitaa: "ایتا",
  wita: "وایتا",
  web: "مرورگر",
};

export const PLATFORM_EMOJI: Record<MiniPlatformId, string> = {
  telegram: "✈️",
  bale: "🟩",
  eitaa: "💬",
  wita: "🅦",
  web: "🌐",
};

/** آیا داخل وب‌ویوی واقعی هستیم؟ */
export function inMessenger(): boolean {
  return detectPlatform() !== "web";
}

/** راه‌اندازی استاندارد: ready + expand + رنگ‌ها */
export function bootWebApp(accent: string): void {
  const app = rawWebApp();
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("color-scheme", app?.colorScheme === "dark" ? "dark" : "light");
  if (!app) return;
  try {
    app.ready?.();
    app.expand?.();
    app.viewport?.setExpanded?.(true);
    app.setHeaderColor?.(accent);
    app.setBackgroundColor?.(isDark() ? "#0f0f14" : "#f6f5f8");
  } catch {
    /* هیچ تعاملی با پیام‌رسان نباید اپ را بشکند */
  }
}

/** تم تیره — از پیام‌رسان یا از تنظیم سیستم */
export function isDark(): boolean {
  const scheme = rawWebApp()?.colorScheme;
  if (scheme === "dark") return true;
  if (scheme === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** رشتهٔ خام initData (برای ارسال به سرور) */
export function initData(): string {
  const app = rawWebApp();
  const raw = app?.initData ?? "";
  if (raw) return raw;
  // بعضی پیام‌رسان‌ها فقط در query می‌گذارند
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("initData") ?? "";
}

/** پروفایل خام (فقط برای نمایش؛ هرگز ملاک هویت نیست) */
export function messengerProfile(): { name: string; username: string; photoUrl: string } {
  const u = rawWebApp()?.initDataUnsafe?.user;
  return {
    name: [u?.first_name, ""].filter(Boolean).join(" ").trim() || "",
    username: u?.username ?? "",
    photoUrl: u?.photo_url ?? "",
  };
}

/** لرزش کوتاه (در پیام‌رسان‌های پشتیبانی‌کننده) */
export function haptic(kind: "light" | "medium" | "success" = "light"): void {
  try {
    rawWebApp()?.HapticFeedback?.impactOccurred?.(kind === "success" ? "rigid" : kind);
  } catch {
    /* بی‌اثر */
  }
}

/**
 * اتصال دکمهٔ «برگشت» پیام‌رسان به روتر.
 * @returns تابع پاک‌سازی
 */
export function onNativeBack(cb: () => boolean): () => void {
  const back = rawWebApp()?.BackButton;
  if (!back?.show || !back.onClick) return () => {};
  const handler = () => {
    if (!cb()) return;
  };
  try {
    back.onClick?.(handler);
    back.show?.();
  } catch {
    /* پشتیبانی نشد */
  }
  return () => {
    try {
      back.offClick?.(handler);
      back.hide?.();
    } catch {
      /* بی‌اثر */
    }
  };
}

/** بستن مینی‌اپ (دکمهٔ «پایان» در صفحهٔ موفقیت) */
export function closeMiniApp(): void {
  const app = rawWebApp();
  try {
    (app as unknown as { close?: () => void })?.close?.();
  } catch {
    /* اگر پیام‌رسان بستن را مجاز نداند، کاربر دستی می‌بندد */
  }
}
