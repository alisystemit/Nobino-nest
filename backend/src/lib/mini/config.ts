/**
 * خواندن تنظیمات مینی‌اپ پیام‌رسان‌ها (سطح پلتفرم) از پنل سوپرادمین.
 * همهٔ مقادیر از جدول `Setting` با پیشوند `miniapps.` می‌آیند؛ توکن‌ها هرگز
 * از این مسیر به کلاینت نمی‌روند (فقط `platformToken` برای راستی‌آزمایی سرور).
 */
import { getSetting, getSettingGroup } from "@/lib/settings";
import { SITE_URL } from "@/lib/site";

export type MiniPlatformId = "telegram" | "bale" | "eitaa" | "wita";

export type MiniPlatform = {
  id: MiniPlatformId;
  label: string;
  emoji: string;
  enabled: boolean;
  bot: string;
  app: string;
  link: string;
  installUrl: string;
  /** آیا این پلتفرم initData امضاشده می‌دهد و ورود بی‌حس پشتیبانی می‌شود؟ */
  signedInitData: boolean;
};

export type MiniBrand = {
  title: string;
  subtitle: string;
  accent: string;
  heroText: string;
  supportPhone: string;
  showPrices: boolean;
};

export type MiniFeatures = {
  booking: boolean;
  reviews: boolean;
  manageTab: boolean;
  requireLogin: boolean;
  silentLogin: boolean;
  showFeatured: boolean;
};

export type MiniConfig = {
  baseUrl: string;
  miniUrl: string;
  brand: MiniBrand;
  features: MiniFeatures;
  featured: string[];
  platforms: MiniPlatform[];
};

const PLATFORM_DEFS: { id: MiniPlatformId; label: string; emoji: string; signedInitData: boolean }[] = [
  { id: "telegram", label: "تلگرام", emoji: "✈️", signedInitData: true },
  { id: "bale", label: "بله", emoji: "🟩", signedInitData: true },
  { id: "eitaa", label: "ایتا", emoji: "💬", signedInitData: false },
  { id: "wita", label: "وایتا", emoji: "🅦", signedInitData: false },
];

function bool(value: string | undefined, fallback: boolean): boolean {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

/** رنگ اصلی — فقط hex سه‌رقمی یا شش‌رقمی پذیرفته می‌شود (در غیر این صورت پیش‌فرض) */
function accent(value: string | undefined): string {
  const v = (value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v) ? v : "#e11d63";
}

/** لینک رسمی نصب هر پلتفرم؛ لینک دستیِ پنل در اولویت است. */
export function platformInstallUrl(p: { id: MiniPlatformId }, bot: string, app: string, link: string): string {
  if (link.trim()) return link.trim();
  const b = bot.replace(/^@+/, "").trim();
  if (!b) return "";
  if (p.id === "telegram") {
    return app.trim() ? `https://t.me/${b}/${app.trim()}` : `https://t.me/${b}`;
  }
  if (p.id === "bale") {
    return app.trim() ? `https://ble.ir/${b}?startapp=${encodeURIComponent(app.trim())}` : `https://ble.ir/${b}`;
  }
  if (p.id === "eitaa") {
    // ایتا الگوی رسمی «استارت‌اپ» مستند ندارد؛ لینک دستی پنل در اولویت است و
    // در نبود آن، آدرس پروفایل ربات داده می‌شود.
    return b ? `https://eitaa.com/${b}` : "";
  }
  // وایتا: الگوی عمومی شناخته‌شده‌ای مستند نیست — لینک باید از پنل وایتا وارد شود
  return "";
}

/** پیکربندی کامل مینی‌اپ با پیش‌فرض‌های امن */
export async function readMiniConfig(): Promise<MiniConfig> {
  const g = await getSettingGroup("miniapps.");
  const base = (g["base_url"] ?? "").trim() || SITE_URL;

  const grouped: Record<string, Record<string, string>> = {};
  for (const key of Object.keys(g)) {
    const dot = key.indexOf(".");
    if (dot < 0) continue;
    const pid = key.slice(0, dot);
    const field = key.slice(dot + 1);
    (grouped[pid] ??= {})[field] = g[key] ?? "";
  }

  const platforms = PLATFORM_DEFS.map((def) => {
    const conf = grouped[def.id] ?? {};
    const bot = conf["bot"] ?? "";
    const app = conf["app"] ?? "";
    const link = conf["link"] ?? "";
    return {
      id: def.id,
      label: def.label,
      emoji: def.emoji,
      signedInitData: def.signedInitData,
      enabled: bool(conf["enabled"], false),
      bot: bot.replace(/^@+/, ""),
      app,
      link,
      installUrl: platformInstallUrl(def, bot, app, link),
    };
  });

  const featured = (g["featured"] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]{2,40}$/.test(s))
    .slice(0, 12);

  return {
    baseUrl: base.replace(/\/+$/, ""),
    miniUrl: `${base.replace(/\/+$/, "")}/mini`,
    brand: {
      title: (g["title"] ?? "").trim() || "نوبینو",
      subtitle: (g["subtitle"] ?? "").trim() || "نوبتگیری آسان از پیام‌رسان",
      accent: accent(g["accent"]),
      heroText: (g["hero_text"] ?? "").trim(),
      supportPhone: (g["support_phone"] ?? "").trim(),
      showPrices: bool(g["show_prices"], true),
    },
    features: {
      booking: bool(g["allow_booking"], true),
      reviews: bool(g["allow_reviews"], true),
      manageTab: bool(g["manage_tab"], true),
      requireLogin: bool(g["require_login"], false),
      silentLogin: bool(g["silent_login"], true),
      showFeatured: featured.length > 0,
    },
    featured,
    platforms,
  };
}

/** توکن ربات یک پلتفرم (محرمانه؛ فقط سمت سرور) */
export async function platformToken(platform: string): Promise<string> {
  const p = platform.trim().toLowerCase();
  if (!PLATFORM_DEFS.some((d) => d.id === p)) return "";
  return (await getSetting(`miniapps.${p}.token`)) ?? "";
}

/** آیا پلتفرم در پنل فعال شده است؟ */
export async function platformEnabled(platform: string): Promise<boolean> {
  const p = platform.trim().toLowerCase();
  if (!PLATFORM_DEFS.some((d) => d.id === p)) return false;
  const raw = await getSetting(`miniapps.${p}.enabled`);
  return bool(raw ?? "", false);
}

export const MINI_PLATFORM_IDS = PLATFORM_DEFS.map((d) => d.id);
