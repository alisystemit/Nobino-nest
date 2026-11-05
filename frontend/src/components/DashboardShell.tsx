"use client";

import Link from "@/router-shim";
import { usePathname, useRouter } from "@/router-shim";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Store,
  CalendarDays,
  Mic,
  PenLine,
  Percent,
  Wallet,
  Package,
  User,
  Users,
  Settings,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Search,
} from "lucide-react";

import SalonIcon from "@/components/icons/SalonIcon";
import { fetchMe } from "@/lib/session";

/**
 * قاب داشبورد — سایدبار تیره با آیکون، بخش‌بندی منو، کارت پروفایل در پایین،
 * منوی کشویی موبایل و ناوبری پایین گوشی.
 * اگر `bare` باشد (فقط برای صفحهٔ نوبت‌ها)، همهٔ منوها/سایدبار حذف می‌شوند
 * و فقط محتوا + ناوبری پایین موبایل می‌ماند.
 */
type NavItem = { href: string; label: string; roles?: string[]; icon: React.ComponentType<{ className?: string }> };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "منو",
    items: [
      { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
      { href: "/dashboard/salon", label: "سالن من", icon: Store, roles: ["SALON_OWNER", "ADMIN"] },
      { href: "/dashboard/customers", label: "مشتریان", icon: User, roles: ["SALON_OWNER", "ADMIN"] },
      { href: "/dashboard/management", label: "مدیریت سالن", icon: Settings, roles: ["SALON_OWNER", "ADMIN"] },
      { href: "/dashboard/appointments", label: "نوبت‌ها", icon: CalendarDays, roles: ["SALON_OWNER", "ADMIN", "CUSTOMER"] },
      { href: "/dashboard/new-appointment", label: "رزرو دستی", icon: PenLine, roles: ["SALON_OWNER", "ADMIN"] },
      { href: "/dashboard/voice-booking", label: "رزرو صوتی هوشمند", icon: Mic, roles: ["SALON_OWNER", "ADMIN"] },
      { href: "/dashboard/commission", label: "کمیسیون", icon: Percent, roles: ["AGENT", "ADMIN"] },
    ],
  },
  {
    title: "مالی",
    items: [
      { href: "/dashboard/wallet", label: "کیف پول", icon: Wallet },
      { href: "/packages", label: "پکیج‌ها", icon: Package, roles: ["SALON_OWNER", "AGENT", "ADMIN"] },
    ],
  },
  {
    title: "حساب",
    items: [
      { href: "/dashboard/settings", label: "تنظیمات سالن", icon: Settings, roles: ["SALON_OWNER", "ADMIN"] },
      { href: "/dashboard/staff", label: "کارکنان", icon: Users, roles: ["SALON_OWNER", "ADMIN"] },
      { href: "/dashboard/account", label: "حساب من", icon: User },
      { href: "/admin", label: "سوپرادمین", icon: ShieldCheck, roles: ["ADMIN"] },
    ],
  },
];

const roleLabels: Record<string, string> = {
  ADMIN: "سوپرادمین",
  SALON_OWNER: "آرایشگر / مالک سالن",
  AGENT: "نماینده",
  CUSTOMER: "مشتری",
};

type Me = { name?: string | null; phone?: string; avatarUrl?: string | null };

function UserAvatar({ me, className }: { me: Me | null; className?: string }) {
  if (me?.avatarUrl) {
    return (
      <img src={me.avatarUrl} alt="آواتار" className={`h-10 w-10 shrink-0 rounded-full object-cover ${className ?? ""}`} />
    );
  }
  const initial = (me?.name ?? me?.phone ?? "؟").trim().slice(0, 1);
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-purple-600 text-base font-black text-white ${className ?? ""}`}>
      {initial}
    </span>
  );
}

export default function DashboardShell({
  role,
  title,
  children,
  bare = false,
}: {
  role: string;
  title: string;
  children: React.ReactNode;
  bare?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    (async () => {
      // C17: پروب مشترک — با AuthProvider و صفحهٔ میزبان یک درخواست هم‌زمان می‌کنند
      const { user } = await fetchMe();
      if (user) setMe(user as Me);
    })();
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  /** ناوبری پایین گوشی */
  const mobileNav: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; primary?: boolean }[] = [
    { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
    ...(role !== "AGENT" ? [{ href: "/dashboard/appointments", label: "نوبت‌ها", icon: CalendarDays }] : []),
    ...(role === "SALON_OWNER" || role === "ADMIN"
      ? [{ href: "/dashboard/voice-booking", label: "رزرو صوتی", icon: Mic, primary: true }]
      : role === "CUSTOMER"
        ? [{ href: "/salons", label: "سالن‌ها", icon: Search }]
        : [{ href: "/dashboard/commission", label: "کمیسیون", icon: Percent }]),
    { href: "/dashboard/wallet", label: "کیف پول", icon: Wallet },
    { href: "/dashboard/account", label: "حساب", icon: User },
  ];

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/");
      router.refresh();
    }
  }

  const Sidebar = (
    <aside
      className={`flex h-full flex-col bg-[#1c2434] text-neutral-300 transition-all duration-300 ${
        collapsed ? "w-[88px]" : "w-72"
      }`}
    >
      {/* لوگو */}
      <div className={`flex h-16 items-center gap-3 px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-white shadow-lg shadow-pink-900/40">
            <SalonIcon className="h-5 w-5" />
          </span>
          {!collapsed && (
            <span className="truncate">
              <span className="block text-base font-black text-white">نوبینو</span>
              <span className="block text-[10px] text-neutral-400">نوبت‌دهی هوشمند آرایشگاه</span>
            </span>
          )}
        </Link>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="hidden items-center justify-center rounded-lg p-1.5 text-neutral-400 transition hover:bg-white/10 hover:text-white lg:flex"
          aria-label={collapsed ? "باز کردن منو" : "بستن منو"}
          title={collapsed ? "باز کردن منو" : "بستن منو"}
        >
          {collapsed ? <ChevronsLeft className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
        </button>
      </div>

      {/* منو */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 [scrollbar-width:thin]">
        {SECTIONS.map((section) => {
          const items = section.items.filter((n) => !n.roles || n.roles.includes(role));
          if (!items.length) return null;
          return (
            <div key={section.title}>
              {!collapsed && (
                <div className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500">{section.title}</div>
              )}
              <div className="space-y-1">
                {items.map((n) => {
                  const active = isActive(n.href);
                  const Icon = n.icon;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={() => setOpen(false)}
                      title={collapsed ? n.label : undefined}
                      className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                        collapsed ? "justify-center px-2" : ""
                      } ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
                      }`}
                    >
                      {active && <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-pink-500 to-purple-500" />}
                      <Icon className={`h-5 w-5 shrink-0 ${active ? "text-pink-400" : ""}`} />
                      {!collapsed && <span className="truncate">{n.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* پروفایل */}
      <div className={`border-t border-white/10 p-3 ${collapsed ? "flex justify-center" : ""}`}>
        <div className="flex items-center gap-3">
          <UserAvatar me={me} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-white">{me?.name ?? me?.phone ?? "کاربر نوبینو"}</div>
              <div className="truncate text-[11px] text-neutral-400">{roleLabels[role] ?? role}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-red-500/15 hover:text-red-400"
              aria-label="خروج از حساب"
              title="خروج از حساب"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-[#f3f5f9] dark:bg-neutral-950">
      {/* سایدبار دسکتاپ — سمت راست (اولین فرزند در چیدمان RTL) */}
      {!bare && (
        <div className="sticky top-0 hidden h-screen shrink-0 lg:block">{Sidebar}</div>
      )}

      {/* محتوا */}
      <div className="min-w-0 flex-1">
        {/* دکمهٔ منوی موبایل (فقط وقتی منو فعال است) */}
        {!bare && (
          <div className="flex items-center gap-2 px-4 pt-4 lg:hidden">
            <button
              onClick={() => setOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1c2434] text-white shadow-md"
              aria-label="باز کردن منو"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-black text-neutral-700 dark:text-neutral-200">{title}</span>
          </div>
        )}
        <main className="p-4 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(7rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* دراور منوی موبایل — فقط وقتی bare نباشد */}
      {!bare && open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full shadow-2xl">
            <div className="flex h-16 items-center justify-between bg-[#1c2434] px-4">
              <span className="text-base font-black text-white">نوبینو</span>
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-300 hover:bg-white/10"
                aria-label="بستن منو"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="h-[calc(100%-4rem)]">{Sidebar}</div>
          </div>
        </div>
      )}

      {/* ناوبری پایین گوشی */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950/95 lg:hidden"
        aria-label="ناوبری اصلی"
      >
        <div className="mx-auto flex max-w-lg items-end justify-around px-1.5">
          {mobileNav.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-black transition active:scale-95 ${
                  active ? "text-pink-600 dark:text-pink-400" : "text-neutral-400 dark:text-neutral-500"
                } ${item.primary ? "-mt-4" : ""}`}
              >
                <span
                  className={`flex items-center justify-center ${
                    item.primary
                      ? "h-12 w-12 rounded-2xl bg-gradient-to-br from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-500/35"
                      : "h-7 w-9 rounded-xl"
                  }`}
                >
                  <Icon className={item.primary ? "h-6 w-6" : "h-5 w-5"} />
                </span>
                <span className="truncate">{item.label}</span>
                {active && !item.primary && <span className="absolute -top-0.5 h-1 w-6 rounded-full bg-pink-500" />}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
