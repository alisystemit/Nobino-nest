// مینی‌اپ پیام‌رسان‌ها — کانفیگ عمومی صفحهٔ /mini
// تنظیمات از بخش «مینی‌اپ پیام‌رسان‌ها» در پنل سوپرادمین (settings-catalog) خوانده می‌شود.
// توکن‌ها (secret) هرگز به کلاینت نمی‌روند؛ فقط لینک‌های نصب، وضعیت فعال‌سازی،
// برندینگ و کلیدهای روشن/خاموش بودن ویژگی‌ها.
import { json } from "@/lib/utils";
import { readMiniConfig } from "@/lib/mini/config";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  const cfg = await readMiniConfig();

  return json({
    success: true,
    // ── سازگاری با پاسخ قبلی ──
    miniUrl: cfg.miniUrl,
    manageTab: cfg.features.manageTab,
    platforms: cfg.platforms
      .filter((p) => p.enabled)
      .map((p) => ({ id: p.id, label: p.label, emoji: p.emoji, bot: p.bot, installUrl: p.installUrl })),
    // ── تازه (مصرف‌شده توسط ماژول /mini) ──
    brand: cfg.brand,
    features: cfg.features,
    featured: cfg.featured,
    availablePlatforms: cfg.platforms.map((p) => ({
      id: p.id,
      label: p.label,
      emoji: p.emoji,
      enabled: p.enabled,
      installUrl: p.installUrl,
      silentLogin: p.signedInitData,
    })),
  });
}
