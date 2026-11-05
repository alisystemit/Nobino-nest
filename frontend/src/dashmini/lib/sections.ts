/**
 * نقشهٔ بخش‌های داشبورد — هم برای کاشی‌ها و منوی «همه بخش‌ها» استفاده می‌شود و هم
 * برای صفحهٔ جایگزین (DashSoon). تا وقتی صفحه‌ای به سبک مینی‌اپ بازنویسی نشده،
 * همان بخش با مسیر کلاسیکش باز می‌شود تا هیچ قابلیتی از دست نرود.
 */
import type { IconName } from "@/mini/components/ui";

export type Section = {
  /** مسیر داخلی داشبورد مینی، بدون پیشوند /dash */
  to: string;
  label: string;
  sub: string;
  icon: IconName;
  /** مسیر همان بخش در داشبورد کلاسیک */
  classic: string;
  /** نقش‌هایی که این بخش را می‌بینند (خالی = همه) */
  roles?: string[];
  /** آیا صفحه به سبک مینی‌اپ بازنویسی شده؟ */
  built?: boolean;
};

export const SECTIONS: Section[] = [
  { to: "/appointments", label: "نوبت‌ها", sub: "تأیید، انجام شد، جابه‌جایی و لغو", icon: "calendar", classic: "/dashboard/appointments", roles: ["SALON_OWNER", "ADMIN", "AGENT", "CUSTOMER"], built: true },
  { to: "/booking", label: "رزرو دستی", sub: "ثبت نوبت تلفنی یا حضوری", icon: "edit", classic: "/dashboard/new-appointment", roles: ["SALON_OWNER", "ADMIN"], built: true },
  { to: "/voice-booking", label: "رزرو صوتی", sub: "صدای فارسی را هوش مصنوعی ثبت می‌کند", icon: "mic", classic: "/dashboard/voice-booking", roles: ["SALON_OWNER", "ADMIN"] },
  { to: "/customers", label: "مشتریان", sub: "کارت مشتری، یادداشت و فایل", icon: "users", classic: "/dashboard/customers", roles: ["SALON_OWNER", "ADMIN"], built: true },
  { to: "/staff", label: "کارکنان", sub: "آرایشگران، کمیسیون و شیفت", icon: "scissors", classic: "/dashboard/staff", roles: ["SALON_OWNER", "ADMIN"], built: true },
  { to: "/services", label: "خدمات و پکیج", sub: "نام، قیمت و مدت هر خدمت", icon: "ticket", classic: "/dashboard/salon", roles: ["SALON_OWNER", "ADMIN"], built: true },
  { to: "/salon", label: "سالن من", sub: "صفحهٔ عمومی و وضعیت سالن", icon: "store", classic: "/dashboard/salon", roles: ["SALON_OWNER", "ADMIN"], built: true },
  { to: "/settings", label: "تنظیمات سالن", sub: "ساعات کاری، قوانین رزرو و دامنه", icon: "pin", classic: "/dashboard/settings", roles: ["SALON_OWNER", "ADMIN"] },
  { to: "/management", label: "مدیریت سالن", sub: "تعطیلات، شعبه، کمپین و بلوک‌ها", icon: "chart", classic: "/dashboard/management", roles: ["SALON_OWNER", "ADMIN"] },
  { to: "/finance", label: "مالی و گزارش", sub: "درآمد، صندوق و گزارش روزانه", icon: "wallet", classic: "/dashboard/management", roles: ["SALON_OWNER", "ADMIN"] },
  { to: "/wallet", label: "کیف پول", sub: "موجودی و تراکنش‌ها", icon: "wallet", classic: "/dashboard/wallet" },
  { to: "/commission", label: "کمیسیون", sub: "درصد و درآمد نمایندگی", icon: "bolt", classic: "/dashboard/commission", roles: ["AGENT", "ADMIN"] },
  { to: "/packages", label: "پکیج‌ها", sub: "خرید و تمدید اشتراک", icon: "star", classic: "/packages", roles: ["SALON_OWNER", "AGENT", "ADMIN"] },
  { to: "/notifications", label: "اطلاعیه‌ها", sub: "پیام‌های سیستم و نوبت‌ها", icon: "bell", classic: "/dashboard", built: true },
  { to: "/account", label: "حساب من", sub: "پروفایل، رمز و سبک داشبورد", icon: "user", classic: "/dashboard/account", built: true },
  { to: "/admin", label: "سوپرادمین", sub: "تنظیمات کل پلتفرم و سالن‌ها", icon: "sparkle", classic: "/admin", roles: ["ADMIN"] },
];

export function visibleSections(role?: string | null): Section[] {
  return SECTIONS.filter((s) => !s.roles || !role || s.roles.includes(role));
}

export function findSection(pathname: string): Section | undefined {
  return SECTIONS.find((s) => s.to === pathname);
}
