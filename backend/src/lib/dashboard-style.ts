/**
 * سبک داشبورد مالک سالن — «وب» (نسخهٔ کلاسیک، Dashboard*.tsx) یا «مینی» (نسخهٔ
 * به‌سبک مینی‌اپ، dashmini/*).
 *
 * انتخاب فقط با تنظیم سوپرادمین انجام می‌شود و دو سطح دارد:
 *   dashboard.style                 پیش‌فرض سراسری (در کاتالوگ تنظیمات پنل)
 *   dashboard.style.salon.<salonId> اورراید یک سالن خاص
 * همان کلیدهای ترکیبی که برای سقف پلن‌ها (plan.limit.<PLAN>.<key>) استفاده
 * می‌شود؛ برای همین نیازی به مهاجرت دیتابیس نیست و PATCH /api/admin/settings
 * (که هر کلید تازه‌ای را می‌پذیرد) برای نوشتنشان کافی است.
 *
 * مقدار پیش‌فرض «web» است تا تا وقتی سوپرادمین خودش انتخاب نکرده، هیچ داشبورد
 * existing‌ای جابه‌جا نشود.
 */
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";

export type DashboardStyle = "web" | "mini";

/** کلید تنظیم سراسری (پیش‌فرض همهٔ سالن‌ها) */
export const GLOBAL_STYLE_KEY = "dashboard.style";

/** کلید اورراید یک سالن */
export function salonStyleKey(salonId: string): string {
  return `dashboard.style.salon.${salonId}`;
}

function coerceStyle(raw: string | undefined): DashboardStyle | undefined {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "mini" || value === "miniapp" || value === "mini_app") return "mini";
  if (value === "web" || value === "classic" || value === "desktop") return "web";
  return undefined;
}

/** سالن اصلی کاربر: مالک → اولین سالنش، کارمند → سالن پروفایل Staff او */
async function primarySalonId(user: { id: string; role: string }): Promise<string | null> {
  if (user.role === "SALON_OWNER") {
    const salon = await prisma.salon.findFirst({
      where: { ownerId: user.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    return salon?.id ?? null;
  }
  if (user.role === "AGENT") {
    const staff = await prisma.staff.findFirst({
      where: { userId: user.id },
      orderBy: [{ id: "asc" }],
      select: { salonId: true },
    });
    return staff?.salonId ?? null;
  }
  return null;
}

/** سبک یک سالن خاص (اورراید ← پیش‌فرض سراسری ← web) */
export async function dashboardStyleForSalon(salonId: string | null): Promise<DashboardStyle> {
  if (salonId) {
    const own = coerceStyle(await getSetting(salonStyleKey(salonId)));
    if (own) return own;
  }
  return coerceStyle(await getSetting(GLOBAL_STYLE_KEY)) ?? "web";
}

/** سبک داشبوردِ کاربرِ لاگین‌کرده؛ برای ادمین همان پیش‌فرض سراسری است */
export async function dashboardStyleForUser(user: { id: string; role: string }): Promise<DashboardStyle> {
  return dashboardStyleForSalon(await primarySalonId(user));
}
