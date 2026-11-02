/**
 * تشخیص «سالن صفحهٔ خانه» در مینی‌اپ.
 *
 * مینی‌اپ سالن‌محور است: فهرست یا جست‌وجوی سالن‌ها وجود ندارد و کاربر فقط سالن‌هایی را
 * می‌بیند که خودش آن‌ها را آورده (اسکن کیو‌آر / لینک) یا از آن‌ها نوبت گرفته.
 * «سالن نمونه» یا سالن پیش‌فرض سوپرادمین حذف شده است. زنجیرهٔ تشخیص،
 * از قطعی‌ترین به عمومی‌ترین:
 *   ۱) اسلاگ داخل لینک/کیو‌آر  →  /mini?salon=mah  یا  /mini?slug=mah
 *   ۲) سالن خود کاربر (اگر سالن‌دار است)  →  /api/dashboard/stats
 *   ۳) آخرین سالنی که کاربر از آن نوبت گرفته  →  /api/appointments?limit=1
 *   ۴) اگر دقیقاً یک سالن در علاقه‌مندی‌هایش باشد  →  /api/favorites
 * اگر هیچ‌کدام نبود `source: "none"` برمی‌گردد و خانه، فهرست علاقه‌مندی‌ها را نشان می‌دهد
 * (خالی باشد: راهنمای اسکن کیو‌آر و دکمهٔ ورود — هیچ سالن دیگری فاش نمی‌شود).
 */
import { mapi } from "./store";
import type { MiniUser } from "./store";

export type HomeSource = "link" | "owner" | "last_booking" | "favorites" | "none";

export type HomeSalon = { slug: string; source: HomeSource };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** اسلاگ از پارامترهای کوئری (پیام‌رسان‌ها معمولاً ?startapp= یا ?salon= می‌فرستند) */
export function slugFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of ["salon", "slug", "s", "startapp", "startparam", "fav"]) {
    const raw = (params.get(key) ?? "").trim().toLowerCase();
    // مقدار startapp ممکن است «salon:mah» باشد
    const value = raw.includes(":") ? raw.split(":").pop() ?? "" : raw;
    if (SLUG_RE.test(value)) return value;
  }
  return "";
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value.trim().toLowerCase());
}

export async function resolveHomeSalon(opts: {
  search: string;
  me: MiniUser | null;
  /** اسلاگ سالن‌های علاقه‌مندی کاربر (از /api/favorites) */
  favorites?: string[];
}): Promise<HomeSalon> {
  const fromLink = slugFromSearch(opts.search);
  if (fromLink) return { slug: fromLink, source: "link" };

  // ۲) سالن‌دار — سالن خودش
  if (opts.me?.role === "SALON_OWNER") {
    const res = await mapi<{ success: boolean; stats?: { hasSalon?: boolean; slug?: string } }>("/api/dashboard/stats");
    const slug = res.ok ? res.data?.stats?.slug : "";
    if (isSlug(slug)) return { slug: slug.trim().toLowerCase(), source: "owner" };
  }

  // ۳) آخرین سالنی که این کاربر از آن نوبت گرفته (نوبت‌های مهمان با همان شمارهٔ تلفن هم می‌آیند)
  if (opts.me) {
    const res = await mapi<{ success: boolean; appointments?: { salonSlug?: string | null }[] }>("/api/appointments?limit=1");
    const slug = res.ok ? res.data?.appointments?.[0]?.salonSlug : "";
    if (isSlug(slug)) return { slug: slug.trim().toLowerCase(), source: "last_booking" };
  }

  // ۴) فقط یک سالن در علاقه‌مندی‌ها — همان خانه است؛ با دو تا یا بیشتر، خانه فهرست می‌شود
  const favs = (opts.favorites ?? []).filter(isSlug).map((s) => s.trim().toLowerCase());
  if (favs.length === 1) return { slug: favs[0], source: "favorites" };

  return { slug: "", source: "none" };
}

export const SOURCE_LABEL: Record<HomeSource, string> = {
  link: "از لینک/کیو‌آر سالن",
  owner: "سالن شما",
  last_booking: "آخرین سالن شما",
  favorites: "علاقه‌مندی شما",
  none: "",
};
