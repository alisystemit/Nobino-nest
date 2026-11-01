// مینی‌اپ پیام‌رسان‌ها — کانفیگ عمومی صفحهٔ /mini
// تنظیمات از بخش «مینی‌اپ پیام‌رسان‌ها» در پنل سوپرادمین (settings-catalog) خوانده می‌شود.
// توکن‌ها (secret) هرگز به کلاینت نمی‌روند؛ فقط لینک‌های نصب و وضعیت فعال‌سازی.
import { json } from "@/lib/utils";
import { getSettingGroup } from "@/lib/settings";
import { SITE_URL } from "@/lib/site";

type PlatformDef = { id: string; label: string; emoji: string };

const PLATFORMS: PlatformDef[] = [
  { id: "telegram", label: "تلگرام", emoji: "✈️" },
  { id: "bale", label: "بله", emoji: "🟩" },
  { id: "wita", label: "وایتا", emoji: "🅦" },
];

/** لینک رسمی نصب هر پلتفرم؛ link دستیِ پنل در اولویت است. */
function installUrl(p: PlatformDef, bot: string, app: string, link: string): string {
  if (link.trim()) return link.trim();
  const b = bot.replace(/^@+/, "").trim();
  if (!b) return "";
  if (p.id === "telegram") {
    return app.trim() ? `https://t.me/${b}/${app.trim()}` : `https://t.me/${b}`;
  }
  if (p.id === "bale") {
    return app.trim() ? `https://ble.ir/${b}?startapp=${encodeURIComponent(app.trim())}` : `https://ble.ir/${b}`;
  }
  // وایتا: الگوی عمومی شناخته‌شده‌ای مستند نیست — لینک باید از پنل وایتا وارد شود
  return "";
}

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  const g = await getSettingGroup("miniapps.");
  const base = (g["base_url"] ?? "").trim() || SITE_URL;
  const manageTab = (g["manage_tab"] ?? "true").trim().toLowerCase() !== "false";

  const platforms: Record<string, Record<string, string>> = {};
  for (const key of Object.keys(g)) {
    const dot = key.indexOf(".");
    if (dot < 0) continue;
    const pid = key.slice(0, dot);
    const field = key.slice(dot + 1);
    (platforms[pid] ??= {})[field] = g[key] ?? "";
  }

  const out = PLATFORMS.filter((p) => (platforms[p.id]?.["enabled"] ?? "false").trim().toLowerCase() === "true").map(
    (p) => {
      const conf = platforms[p.id] ?? {};
      return {
        id: p.id,
        label: p.label,
        emoji: p.emoji,
        bot: (conf["bot"] ?? "").replace(/^@+/, ""),
        installUrl: installUrl(p, conf["bot"] ?? "", conf["app"] ?? "", conf["link"] ?? ""),
      };
    }
  );

  return json({
    success: true,
    miniUrl: `${base.replace(/\/+$/, "")}/mini`,
    manageTab,
    platforms: out,
  });
}
