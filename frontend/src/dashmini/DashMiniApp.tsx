/**
 * پوستهٔ داشبورد مینی‌استایل (/dash/*) — همان امکانات پنل سالن، با واژگان ظاهری
 * ماژول مینی‌اپ. داشبورد کلاسیک (/dashboard/*) دست‌نخورده باقی می‌ماند و سوپرادمین
 * تصمیم می‌گیرد هر سالن با کدام سبک باز شود؛ در صورت mini بودن، مسیرهای قدیمی
 * خودکار به همین ماژول هدایت می‌شوند (در App.tsx).
 */
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BellButton, Icon, Sheet, TopBar } from "@/mini/components/ui";
import { dapi } from "./lib/api";
import { DashProvider, canRoleManage, leaveClassic, requestClassic, useDash } from "./lib/store";
import { visibleSections } from "./lib/sections";
import DashHome from "./pages/DashHome";
import DashAgenda from "./pages/DashAgenda";
import DashBooking from "./pages/DashBooking";
import DashCustomers from "./pages/DashCustomers";
import DashStaff from "./pages/DashStaff";
import DashServices from "./pages/DashServices";
import DashSalon from "./pages/DashSalon";
import DashSettings from "./pages/DashSettings";
import DashManagement from "./pages/DashManagement";
import DashFinance from "./pages/DashFinance";
import DashAccount from "./pages/DashAccount";
import DashNotifications from "./pages/DashNotifications";
import DashSoon from "./pages/DashSoon";
/* واژگان ظاهری مینی‌اپ (کارت‌ها، شیت، تب‌بار، هدر) از همین فایل می‌آید؛ dashmini.css
   فقط لایهٔ مکمل همین ماژول است و بدون آن صفحه بی‌استایل می‌ماند. */
import "@/mini/mini.css";
import "./dashmini.css";

const ROLE_CHIP: Record<string, string> = {
  ADMIN: "سوپرادمین",
  SALON_OWNER: "مالک سالن",
  AGENT: "نماینده",
  CUSTOMER: "مشتری",
};

function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me } = useDash();
  const manage = canRoleManage(me?.role);

  const tabs = [
    { to: "/dash", label: "خانه", icon: "home" as const },
    { to: "/dash/appointments", label: "نوبت‌ها", icon: "calendar" as const },
    ...(manage
      ? [
          { to: "/dash/booking", label: "رزرو", icon: "plus" as const },
          { to: "/dash/customers", label: "مشتریان", icon: "users" as const },
        ]
      : []),
    { to: "/dash/account", label: me ? "حساب من" : "ورود", icon: "user" as const },
  ];

  const active = (to: string) => (to === "/dash" ? location.pathname === "/dash" || location.pathname === "/dash/" : location.pathname.startsWith(to));

  return (
    <nav className="mini-tabs" aria-label="بخش‌های داشبورد">
      <div className="mini-tabs-inner">
        {tabs.map((t) => (
          <button
            key={t.to}
            type="button"
            className={`mini-tab${active(t.to) ? " is-on" : ""}`}
            onClick={() => navigate(t.to)}
            aria-current={active(t.to) ? "page" : undefined}
          >
            <Icon name={t.icon} size={21} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** منوی «همه بخش‌ها» — هر چیزی که در نوار پایین جا نشد اینجاست */
function MenuButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="dash-menu-btn" onClick={onOpen} aria-label="همه بخش‌های داشبورد">
      <Icon name="plus" size={18} />
      <span>همه بخش‌ها</span>
    </button>
  );
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me, authReady, salon, toastNode, payload } = useDash();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!me) {
      setUnread(0);
      return;
    }
    const res = await dapi<{ success: boolean; unread?: number }>("/api/notifications?limit=1");
    setUnread(res.ok ? Number(res.data?.unread ?? 0) : 0);
  }, [me]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, location.pathname]);

  /* تم تیره/روشن سایت روی ریشهٔ این ماژول هم اعمال می‌شود (mini.css وابسته به کلاس است) */
  useEffect(() => {
    const root = document.getElementById("dash-theme-root");
    if (!root) return;
    const dark = document.documentElement.classList.contains("dark") || localStorage.getItem("theme") === "dark";
    root.classList.toggle("dark", dark);
  }, [authReady, location.pathname]);

  if (!authReady) {
    return (
      <div className="mini-fade">
        <div className="mini-skeleton" style={{ height: 120 }} />
        <div style={{ height: 12 }} />
        <div className="mini-skeleton" style={{ height: 74 }} />
      </div>
    );
  }

  if (!me) return <Navigate to="/login" replace />;

  /* سالنی هنوز ساخته نشده → همان ویزارد راه‌اندازی نسخهٔ وب */
  if (payload?.redirect) return <Navigate to={payload.redirect} replace />;

  const isHome = location.pathname === "/dash" || location.pathname === "/dash/";
  const sections = visibleSections(me.role);

  return (
    <div className="dash-shell">
      <TopBar
        brand={salon?.name ?? "داشبورد نوبینو"}
        platformChip={ROLE_CHIP[me.role] ?? me.role}
        onBack={isHome ? undefined : () => navigate(-1)}
        actions={
          <>
            <MenuButton onOpen={() => setMenuOpen(true)} />
            <BellButton count={unread} onClick={() => navigate("/dash/notifications")} />
          </>
        }
      />

      <Routes>
        <Route path="/" element={<DashHome />} />
        <Route path="/appointments" element={<DashAgenda />} />
        <Route path="/notifications" element={<DashNotifications />} />
        <Route path="/account" element={<DashAccount />} />
        <Route path="/booking" element={<DashBooking />} />
        <Route path="/voice-booking" element={<DashSoon />} />
        <Route path="/customers" element={<DashCustomers />} />
        <Route path="/staff" element={<DashStaff />} />
        <Route path="/services" element={<DashServices />} />
        <Route path="/salon" element={<DashSalon />} />
        <Route path="/settings" element={<DashSettings />} />
        <Route path="/management" element={<DashManagement />} />
        <Route path="/finance" element={<DashFinance />} />
        <Route path="/wallet" element={<DashSoon />} />
        <Route path="/commission" element={<DashSoon />} />
        <Route path="/packages" element={<DashSoon />} />
        <Route path="/setup" element={<DashSoon />} />
        <Route path="/admin" element={<DashSoon />} />
        <Route path="*" element={<Navigate to="/dash" replace />} />
      </Routes>

      <Sheet open={menuOpen} title="همهٔ بخش‌های داشبورد" onClose={() => setMenuOpen(false)}>
        <div className="mini-list">
          {sections.map((s) => (
            <button
              key={s.to}
              type="button"
              className={`mini-item${location.pathname === `/dash${s.to}` ? " is-on" : ""}`}
              onClick={() => {
                setMenuOpen(false);
                navigate(`/dash${s.to}`);
              }}
            >
              <span className="mini-item-main">
                <span className="mini-item-title">{s.label}</span>
                <span className="mini-item-sub">{s.built ? s.sub : `${s.sub} · فعلاً نسخهٔ وب`}</span>
              </span>
              <Icon name={s.icon} size={18} />
            </button>
          ))}
        </div>
        <div className="mini-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="mini-btn ghost tiny"
            onClick={() => {
              setMenuOpen(false);
              requestClassic();
              navigate("/dashboard");
            }}
          >
            نسخهٔ وب این بخش‌ها
          </button>
          <button
            type="button"
            className="mini-btn tiny"
            onClick={() => {
              setMenuOpen(false);
              leaveClassic();
              navigate("/dash");
            }}
          >
            برگشت به سبک مینی
          </button>
        </div>
      </Sheet>

      <TabBar />
      {toastNode}
    </div>
  );
}

export default function DashMiniApp() {
  /* باز‌شدن /dash یعنی کاربر خودش سبک مینی را خواسته؛ پس قفل «این تب نسخهٔ وب»
     پاک می‌شود تا رفت‌وبرگشت بین دو سبک در همان تب، بدون پاک‌کردن دستی، کار کند. */
  useEffect(() => {
    leaveClassic();
  }, []);

  return (
    <div className="mini-root" id="dash-theme-root">
      <DashProvider>
        <Shell />
      </DashProvider>
    </div>
  );
}
