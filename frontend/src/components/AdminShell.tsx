"use client";

import Link from "@/router-shim";
import { usePathname, useSearchParams } from "@/router-shim";
import { useState } from "react";
import { ChevronsLeft, ChevronsRight, Home, Menu } from "lucide-react";
import { ThemeToggle } from "@/lib/theme";
import { LangSwitch } from "@/lib/i18n";
import NotificationBell from "@/components/NotificationBell";
import LogoutButton from "@/components/LogoutButton";
import Logo from "@/components/Logo";

const NAV = [
  { href: "/admin", label: "داشبورد", icon: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 4v2h4V7H6Zm6 0v2h6V7h-6Zm-6 4v2h4v-2H6Zm6 0v2h6v-2h-6Zm-6 4v2h4v-2H6Zm6 0v2h6v-2h-6Z" },
  { href: "/admin?tab=charts", label: "نمودارها", icon: "M4 19V5h3v14H4Zm6 0V9h3v10h-3Zm6 0V3h3v16h-3Z" },
  { href: "/admin?tab=salons", label: "سالن‌ها", icon: "M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.5 3.6v6.2L12 17.7 5.5 14.1V7.9L12 4.3ZM11 8h2v6h-2V8Zm0 7h2v2h-2v-2Z" },
  { href: "/admin?tab=subscriptions", label: "اشتراک‌ها", icon: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 2.2 6 2.3v4.5c0 3.9-2.5 7.4-6 8.8-3.5-1.4-6-4.9-6-8.8V6.5l6-2.3Z" },
  { href: "/admin?tab=payouts", label: "تسویه حساب", icon: "M2 6h20v12H2V6Zm2 2v8h16V8H4Zm3 1h5v2H7V9Zm7 4h4v2h-4v-2Z" },
  { href: "/admin?tab=support", label: "پشتیبانی", icon: "M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8a9.9 9.9 0 0 1-3.7-.72L4 20l1.2-3.1A7.6 7.6 0 0 1 3 11c0-4.42 4.03-8 9-8Z" },
  { href: "/admin?tab=security", label: "امنیت", icon: "M12 2a5 5 0 0 0-5 5v3H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm2 6v-2h2v2h-2Z" },
  { href: "/admin?tab=notifications", label: "گزارش پیامک", icon: "M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1Z" },
  { href: "/admin?tab=ai", label: "هوش مصنوعی", icon: "M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h-2a5 5 0 0 0-5-5h-.42c.27.61.42 1.29.42 2a5 5 0 0 1-5 5h-1v2h3v2H7v-2h3v-2H9a5 5 0 0 1-5-5c0-.71.15-1.39.42-2H4a5 5 0 0 0 5 5h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2Zm-5 9a3 3 0 0 1-3 3H6a3 3 0 0 1 3-3h3Zm5.5 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" },
  { href: "/admin?tab=users", label: "کاربران", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm4 14v-2a4 4 0 0 0-8 0v2H6v-2a6 6 0 0 1 12 0v2h-2Z" },
  { href: "/admin?tab=packages", label: "پکیج‌ها", icon: "M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h10v2H4v-2Zm14-2 3 3-3 3-1.4-1.4L17.2 17H14v-2h3.2l-.6-.6L18 14Z" },
  { href: "/admin?tab=limits", label: "محدودیت‌ها", icon: "M3 5h18v2H3V5Zm0 4h12v2H3V9Zm0 4h18v2H3v-2Zm0 4h12v2H3v-2Z" },
  { href: "/admin?tab=discounts", label: "کد تخفیف", icon: "M4 4h7l9 9-7 7-9-9V4Zm2 2v5l7 7 5-5-7-7H6Zm3 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" },
  { href: "/admin?tab=reviews", label: "نظرات", icon: "M12 3c4.97 0 9 3.58 9 8 0 4.42-4.03 8-9 8a9.9 9.9 0 0 1-3.7-.72L4 20l1.2-3.1A7.6 7.6 0 0 1 3 11c0-4.42 4.03-8 9-8Zm0 2c-3.86 0-7 2.69-7 6 0 3.31 3.14 6 7 6 .61 0 1.2-.07 1.76-.2l.8-.18.7.4 1.2.6-.4-1.2-.2-.7.42-.75A6.6 6.6 0 0 0 19 11c0-3.31-3.14-6-7-6ZM9 10h2v2H9v-2Zm4 0h2v2h-2v-2Z" },
  { href: "/admin?tab=sms", label: "پیامک", icon: "M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1Zm1 2v13.2L7.2 17H20V6H5Zm3 3h8v2H8V9Zm0 4h6v2H8v-2Z" },
  { href: "/admin?tab=audit", label: "حسابرسی", icon: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 2.2 6 2.3v4.5c0 3.9-2.5 7.4-6 8.8-3.5-1.4-6-4.9-6-8.8V6.5l6-2.3ZM11 7h2v6h-2V7Zm0 7h2v2h-2v-2Z" },
  { href: "/admin?tab=backup", label: "پشتیبان‌گیری", icon: "M12 3c-4.4 0-8 1.3-8 3s3.6 3 8 3 8-1.3 8-3-3.6-3-8-3Zm6 7.2c-1.6.9-3.8 1.4-6 1.4s-4.4-.5-6-1.4V13c0 1.7 3.6 3 8 3s8-1.3 8-3v-2.8Zm0 5.6c-1.6.9-3.8 1.4-6 1.4s-4.4-.5-6-1.4V18c0 1.7 3.6 3 8 3s8-1.3 8-3v-2.2Z" },
  { href: "/admin?tab=settings", label: "تنظیمات سیستم", icon: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.48.48 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.04-.47-.12-.61l-2.01-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** شل مجزای سوپرادمین — مسیر /admin (سبک تیره TailAdmin) */
export default function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isActive = (href: string) => {
    const [base, q] = href.split("?");
    if (q) {
      const tab = searchParams.get("tab");
      return pathname === base && tab === q.split("=")[1];
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  const collapsedWidth = collapsed && !open;
  const Sidebar = (
    <aside className={`flex h-full flex-col border-l border-white/5 bg-[#1c2434] text-neutral-400 transition-all duration-200 ${collapsedWidth ? "w-[88px]" : "w-72"}`}>
      <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
        {collapsedWidth ? (
          <Logo className="h-9 w-9 text-white" />
        ) : (
          <>
            <Logo className="h-9 w-9 text-white" />
            <div>
              <div className="text-sm font-black text-white">سوپرادمین</div>
              <div className="text-[10px] text-neutral-500">مدیریت پلتفرم</div>
            </div>
          </>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              title={collapsedWidth ? n.label : undefined}
              className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
              } ${collapsedWidth ? "justify-center px-0" : ""}`}
            >
              {active && <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-gradient-to-b from-pink-500 to-purple-500" />}
              <span className={active ? "text-pink-400" : ""}>
                <Icon d={n.icon} />
              </span>
              {!collapsedWidth && n.label}
            </Link>
          );
        })}
      </nav>
      <div className={`border-t border-white/5 px-3 py-3 ${collapsedWidth ? "flex flex-col items-center gap-2" : "flex items-center justify-between"}`}>
        {collapsedWidth ? (
          <>
            <button onClick={() => setCollapsed(false)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-neutral-400 transition hover:text-white" title="باز کردن منو">
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <LogoutButton />
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <LangSwitch />
              <ThemeToggle />
            </div>
            <LogoutButton />
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <div className="sticky top-16 hidden h-[calc(100vh-4rem)] lg:block">{Sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full shadow-2xl">{Sidebar}</div>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="sticky top-16 z-20 flex h-16 items-center justify-between border-b border-neutral-200 bg-white/80 px-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/80 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 text-lg lg:hidden dark:bg-neutral-800" aria-label="منو">
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Link href="/" className="flex items-center gap-1.5 transition hover:text-pink-500">
                <Home className="h-4 w-4" />
                نوبینو
              </Link>
              <span>/</span>
              <h1 className="font-bold text-neutral-900 dark:text-neutral-100">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            <LogoutButton />
            <Link href="/" className="hidden items-center gap-1.5 rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-200 sm:flex dark:bg-neutral-800 dark:text-neutral-300">
              🏠 خروج به سایت
            </Link>
          </div>
        </div>
        <div className="bg-[#f3f5f9] p-4 dark:bg-neutral-950 sm:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}
