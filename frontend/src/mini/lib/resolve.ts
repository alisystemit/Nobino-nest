/**
 * تشخیص «سالن صفحهٔ خانه» در مینی‌اپ.
 *
 * مینی‌اپ سالن‌محور است: فهرست یا جست‌وجوی سالن‌ها وجود ندارد و هر کاربر فقط
 * سالن خودش را می‌بیند. زنجیرهٔ تشخیص، از قطعی‌ترین به عمومی‌ترین:
 *   ۱) اسلاگ داخل لینک پیام‌رسان  →  /mini?salon=mah  یا  /mini?slug=mah
 *   ۲) سالن خود کاربر (اگر سالن‌دار است)  →  /api/dashboard/stats
 *   ۳) آخرین سالنی که کاربر از آن نوبت گرفته  →  /api/appointments?limit=1
 *   ۴) سالن پیش‌فرض که سوپرادمین در پنل گذاشته  →  miniapps.default_salon
 * اگر هیچ‌کدام نبود، `source: "none"` برمی‌گردد و خانهٔ مینی‌اپ کارت پشتیبانی
 * و دکمهٔ ورود را نشان می‌دهد (هیچ سالن دیگری فاش نمی‌شود).
 */
import { mapi } from "./store";
import type { MiniUser } from "./store";

export type HomeSource = "link" | "owner" | "last_booking" | "default" | "none";

export type HomeSalon = { slug: string; source: HomeSource };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** اسلاگ از پارامترهای کوئری (پیام‌رسان‌ها معمولاً ?startapp= یا ?salon= می‌فرستند) */
export function slugFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of ["salon", "slug", "s", "startapp", "startparam"]) {
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
  defaultSalon: string;
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

  // ۴) سالن پیش‌فرض پنل
  if (isSlug(opts.defaultSalon)) return { slug: opts.defaultSalon.trim().toLowerCase(), source: "default" };

  return { slug: "", source: "none" };
}

export const SOURCE_LABEL: Record<HomeSource, string> = {
  link: "از لینک پیام‌رسان",
  owner: "سالن شما",
  last_booking: "آخرین سالن شما",
  default: "سالن پیش‌فرض",
  none: "",
};
