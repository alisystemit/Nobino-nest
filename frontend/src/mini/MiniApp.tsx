/**
 * پوستهٔ مینی‌اپ — مسیرها، نوار بالا، نوار پایین و دکمهٔ «برگشت» پیام‌رسان.
 * این ماژول کاملاً مستقل است: استایلش از ./mini.css می‌آید، هیچ اجزای سایت را
 * import نمی‌کند و فقط با /api/mini/* و endpoint های عمومی نوبینو حرف می‌زند.
 */
import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import MiniHome from "./pages/MiniHome";
import MiniSalon from "./pages/MiniSalon";
import MiniBookings from "./pages/MiniBookings";
import MiniManage from "./pages/MiniManage";
import MiniMe from "./pages/MiniMe";
import { Icon, TopBar, type IconName } from "./components/ui";
import { MiniProvider, useMini } from "./lib/store";
import { PLATFORM_EMOJI, onNativeBack } from "./lib/bridge";
import "./mini.css";

function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, me } = useMini();

  const canManage = Boolean(me && (me.role === "SALON_OWNER" || me.role === "ADMIN" || me.role === "AGENT"));
  const tabs: { to: string; label: string; icon: IconName }[] = [
    { to: "/mini", label: "خانه", icon: "home" },
    { to: "/mini/appointments", label: "نوبت‌های من", icon: "calendar" },
    ...(config.features.manageTab && canManage ? [{ to: "/mini/manage", label: "مدیریت", icon: "store" as IconName }] : []),
    { to: "/mini/me", label: me ? "حساب من" : "ورود", icon: "user" as IconName },
  ];

  const active = (to: string) => (to === "/mini" ? location.pathname === "/mini" : location.pathname.startsWith(to));

  return (
    <nav className="mini-tabs" aria-label="بخش‌های مینی‌اپ">
      <div className="mini-tabs-inner">
        {tabs.map((t) => (
          <button key={t.to} type="button" className={`mini-tab${active(t.to) ? " is-on" : ""}`} onClick={() => navigate(t.to)} aria-current={active(t.to) ? "page" : undefined}>
            <Icon name={t.icon} size={21} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Shell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, platform, configReady, configError, me, messengerName, toastNode } = useMini();

  const isDetail = /^\/mini\/s\//.test(location.pathname);

  useEffect(() => {
    // دکمهٔ «برگشت» طبیعی پیام‌رسان را به روتر وصل می‌کنیم
    return onNativeBack(() => {
      if (window.history.length > 1) {
        navigate(-1);
        return true;
      }
      navigate("/mini");
      return true;
    });
  }, [navigate]);

  const brandChip = configReady ? `${PLATFORM_EMOJI[platform]} ${config.brand.title}` : "…";

  return (
    <div className="mini-shell">
      {isDetail ? (
        <TopBar brand={messengerName && !me ? messengerName : config.brand.title} platformChip={brandChip} onBack={() => navigate("/mini")} />
      ) : null}
      {!configReady ? (
        <div className="mini-fade">
          <div className="mini-skeleton" style={{ height: 120 }} />
          <div style={{ height: 12 }} />
          <div className="mini-skeleton" style={{ height: 74 }} />
          <div style={{ height: 8 }} />
          <div className="mini-skeleton" style={{ height: 74 }} />
        </div>
      ) : configError ? (
        <div className="mini-fade">
          <div className="mini-card">
            <div style={{ fontWeight: 900, marginBottom: 6 }}>مینی‌اپ آماده نیست</div>
            <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
              {configError}
              <br />
              اگر تازه تنظیمات را تغییر دادید، چند لحظه دیگر دوباره باز کنید.
            </div>
          </div>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<MiniHome />} />
          <Route path="/s/:slug" element={<MiniSalon />} />
          <Route path="/appointments" element={<MiniBookings />} />
          <Route path="/manage" element={<MiniManage />} />
          <Route path="/me" element={<MiniMe />} />
          <Route path="*" element={<Navigate to="/mini" replace />} />
        </Routes>
      )}
      <TabBar />
      {toastNode}
    </div>
  );
}

/** ورودی ماژول — در App.tsx روی مسیر /mini/* سوار می‌شود */
export default function MiniApp() {
  return (
    <div className="mini-root" id="mini-theme-root">
      <MiniProvider>
        <Shell />
      </MiniProvider>
    </div>
  );
}
