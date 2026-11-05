/**
 * پوستهٔ مینی‌اپ — مسیرها، نوار بالا، نوار پایین و دکمهٔ «برگشت» پیام‌رسان.
 * این ماژول کاملاً مستقل است: استایلش از ./mini.css می‌آید، هیچ اجزای سایت را
 * import نمی‌کند و فقط با /api/mini/* و endpoint های عمومی نوبینو حرف می‌زند.
 */
import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import MiniHome from "./pages/MiniHome";
import MiniSalon from "./pages/MiniSalon";
import MiniBookings from "./pages/MiniBookings";
import MiniVoiceBooking from "./pages/MiniVoiceBooking";
import MiniManage from "./pages/MiniManage";
import MiniMe from "./pages/MiniMe";
import MiniNotifications from "./pages/MiniNotifications";
import MiniSupport from "./pages/MiniSupport";
import MiniFavorites from "./pages/MiniFavorites";
import { BellButton, Button, Icon, TopBar, type IconName } from "./components/ui";
import MiniInstallSheet from "./components/install-sheet";
import { MiniProvider, mapi, useMini } from "./lib/store";
import { PLATFORM_EMOJI, onNativeBack } from "./lib/bridge";
import "./mini.css";

function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { config, me } = useMini();

  const canManage = Boolean(me && (me.role === "SALON_OWNER" || me.role === "ADMIN" || me.role === "AGENT"));
  const tabs: { to: string; label: string; icon: IconName; title?: string }[] = [
    { to: "/mini", label: "خانه", icon: "home" },
    { to: "/mini/appointments", label: "نوبت‌های من", icon: "calendar" },
    ...(config.features.booking ? [{ to: "/mini/voice-booking", label: "رزرو هوشمند", icon: "mic" as IconName, title: "رزرو با هوش مصنوعی و دستی" }] : []),
    ...(config.features.manageTab && canManage ? [{ to: "/mini/manage", label: "مدیریت", icon: "store" as IconName }] : []),
    { to: "/mini/me", label: me ? "حساب من" : "ورود", icon: "user" as IconName },
  ];

  const active = (to: string) => (to === "/mini" ? location.pathname === "/mini" : location.pathname.startsWith(to));

  return (
    <nav className="mini-tabs" aria-label="بخش‌های مینی‌اپ">
      <div className="mini-tabs-inner">
        {tabs.map((t) => (
          <button
            key={t.to}
            type="button"
            className={`mini-tab${active(t.to) ? " is-on" : ""}`}
            onClick={() => navigate(t.to)}
            aria-current={active(t.to) ? "page" : undefined}
            title={t.title}
            aria-label={t.title}
          >
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
  const { config, platform, configReady, configError, reloadConfig, me, messengerName, toastNode } = useMini();

  const isHome = location.pathname === "/mini" || location.pathname === "/mini/";
  const [unread, setUnread] = useState(0);
  const [retrying, setRetrying] = useState(false);

  /* شمارۀ ناخوانده‌ها: با هر جابه‌جایی صفحه تازه می‌شود (سبک: فقط عدد) */
  const refreshUnread = useCallback(async () => {
    if (!me) {
      setUnread(0);
      return;
    }
    const res = await mapi<{ success: boolean; unread?: number }>("/api/notifications?limit=1");
    setUnread(res.ok ? Number(res.data?.unread ?? 0) : 0);
  }, [me]);

  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread, location.pathname]);

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
      <TopBar
        brand={messengerName && !me ? messengerName : config.brand.title}
        platformChip={brandChip}
        onBack={isHome || !configReady ? undefined : () => navigate(-1)}
        actions={<BellButton count={unread} onClick={() => navigate("/mini/notifications")} />}
      />
      {!configReady ? (
        <div className="mini-fade">
          <div className="mini-skeleton" style={{ height: 120 }} />
          <div style={{ height: 12 }} />
          <div className="mini-skeleton" style={{ height: 74 }} />
          <div style={{ height: 8 }} />
          <div className="mini-skeleton" style={{ height: 74 }} />
        </div>
      ) : (
        <div className="mini-fade">
          {/* خطای کانفیگ دیگر اپ را قفل نمی‌کند: نسخهٔ پیش‌فرض جاری است و همین نوار
              هشدار با دکمهٔ «تلاش دوباره» ماجرا را به کاربر می‌گوید (U1). */}
          {configError ? (
            <div className="mini-card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>نمایش تنظیمات پنل ممکن نشد</div>
              <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
                {configError} — مینی‌اپ با تنظیمات پیش‌فرض باز است و نوبت‌گیری کار می‌کند.
              </div>
              <Button
                variant="soft"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setRetrying(true);
                  void reloadConfig().finally(() => setRetrying(false));
                }}
              >
                <Icon name="refresh" size={17} />
                {retrying ? "در حال تلاش…" : "تلاش دوباره"}
              </Button>
            </div>
          ) : null}
          <Routes>
            <Route path="/" element={<MiniHome />} />
            <Route path="/s/:slug" element={<MiniSalon />} />
            <Route path="/appointments" element={<MiniBookings />} />
            <Route path="/voice-booking" element={<MiniVoiceBooking />} />
            <Route path="/notifications" element={<MiniNotifications />} />
            <Route path="/support" element={<MiniSupport />} />
            <Route path="/favorites" element={<MiniFavorites />} />
            <Route path="/manage" element={<MiniManage />} />
            <Route path="/me" element={<MiniMe />} />
            <Route path="*" element={<Navigate to="/mini" replace />} />
          </Routes>
        </div>
      )}
      <TabBar />
      {toastNode}
      {/* شیت نصب اپ — فقط برای بازدیدکنندهٔ مرورگر (بیرون از تلگرام/بله/ایتا/وایتا) */}
      <MiniInstallSheet />
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
