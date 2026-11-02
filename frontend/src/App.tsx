/**
 * بدنه اپلیکیشن SPA — چیدمان سراسری + جدول مسیرها.
 */
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { AuthProvider, useAuth } from "@/auth";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { currentSalonSlug } from "@/lib/subdomain";
import GlobalHeader from "@/components/GlobalHeader";
import PwaInstall from "@/components/PwaInstall";

import HomePage from "@/pages/HomePage";
import HelpPage from "@/pages/HelpPage";
import OfflinePage from "@/pages/OfflinePage";
import LoginPage from "@/pages/LoginPage";
import PackagesPage from "@/pages/PackagesPage";
import SalonsPage from "@/pages/SalonsPage";
import SalonPage from "@/pages/SalonPage";
import WaPage from "@/pages/WaPage";
import WaSalonPage from "@/pages/WaSalonPage";
import PayPage from "@/pages/PayPage";
import PaymentResultPage from "@/pages/PaymentResultPage";

/**
 * صفحه‌های پشت لگین (داشبورد/ادمین/مینی‌اپ) داینامیک لود می‌شوند تا باندل اولیه
 * فقط شامل مسیرهای عمومی باشد — وگرنه کل SalonManager/AdminExtras (سنگین‌ترین
 * بخش‌های UI) در اولین بازدید هم دانلود می‌شود.
 */
const DashboardHome = lazy(() => import("@/pages/DashboardHome"));
const DashboardAccount = lazy(() => import("@/pages/DashboardAccount"));
const DashboardAppointments = lazy(() => import("@/pages/DashboardAppointments"));
const DashboardNewAppointment = lazy(() => import("@/pages/DashboardNewAppointment"));
const DashboardVoiceBooking = lazy(() => import("@/pages/DashboardVoiceBooking"));
const DashboardWallet = lazy(() => import("@/pages/DashboardWallet"));
const DashboardCommission = lazy(() => import("@/pages/DashboardCommission"));
const DashboardSalon = lazy(() => import("@/pages/DashboardSalon"));
const DashboardManagement = lazy(() => import("@/pages/DashboardManagement"));
const DashboardStaff = lazy(() => import("@/pages/DashboardStaff"));
const DashboardCustomers = lazy(() => import("@/pages/DashboardCustomers"));
const DashboardSetup = lazy(() => import("@/pages/DashboardSetup"));
const DashboardSettings = lazy(() => import("@/pages/DashboardSettings"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const AdminLoginPage = lazy(() => import("@/pages/AdminLoginPage"));
const MiniApp = lazy(() => import("@/mini/MiniApp"));

/** جایگزین موقت حین دانلود چانک یک صفحه */
function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-neutral-500">در حال بارگذاری…</div>
  );
}

function RequireAuth({ roles }: { roles?: string[] }) {
  const { me, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-neutral-500">
        در حال بارگذاری…
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(me.role)) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * اگر کاربر روی یک ساب‌دامین سالن (مثل mah.localhost:5175) باشد، صفحهٔ سالن
 * همان اسلاگ را نمایش می‌دهد — بدون نیاز به مسیر /s/<slug>. در غیر این صورت
 * چیدمان سراسری و جدول مسیرهای عادی روتر اجرا می‌شوند.
 */
function AppInner() {
  const location = useLocation();
  const slug = currentSalonSlug();
  if (slug) {
    return (
      <div className="flex min-h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <SalonPage slug={slug} />
      </div>
    );
  }
  // ماژول مینی‌اپ پیام‌رسان‌ها — تمام‌صفحه، بدون هدر سراسری و مستقل از AuthProvider سایت
  const isMiniApp = location.pathname === "/mini" || location.pathname.startsWith("/mini/");
  // صفحات «راه‌اندازی» و «ساخت سالن جدید» به‌صورت مستقل و تمام‌صفحه نمایش داده می‌شوند (بدون منوی بالا/کنار)
  const hideHeader =
    isMiniApp ||
    location.pathname.startsWith("/dashboard/setup") ||
    (location.pathname === "/dashboard/salon" && new URLSearchParams(location.search).has("new"));
  return (
    <div className="flex min-h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {!hideHeader && <GlobalHeader />}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/offline" element={<OfflinePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/packages" element={<PackagesPage />} />
          <Route path="/salons" element={<SalonsPage />} />
          <Route path="/s/:slug" element={<SalonPage />} />
          <Route path="/wa" element={<WaPage />} />
          <Route path="/wa/salon/:slug" element={<WaSalonPage />} />
          <Route path="/pay/:token" element={<PayPage />} />
          <Route path="/payment/result" element={<PaymentResultPage />} />
          <Route path="/mini/*" element={<MiniApp />} />

          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<DashboardHome />} />
            <Route path="/dashboard/account" element={<DashboardAccount />} />
            <Route path="/dashboard/appointments" element={<DashboardAppointments />} />
            <Route path="/dashboard/wallet" element={<DashboardWallet />} />
            <Route path="/dashboard/commission" element={<DashboardCommission />} />
            <Route path="/dashboard/admin" element={<Navigate to="/admin" replace />} />
          </Route>

          <Route element={<RequireAuth roles={["SALON_OWNER", "ADMIN", "AGENT"]} />}>
            <Route
              path="/dashboard/new-appointment"
              element={<DashboardNewAppointment />}
            />
            <Route
              path="/dashboard/voice-booking"
              element={<DashboardVoiceBooking />}
            />
          </Route>
          <Route element={<RequireAuth roles={["SALON_OWNER", "ADMIN"]} />}>
            <Route path="/dashboard/salon" element={<DashboardSalon />} />
            <Route path="/dashboard/setup" element={<DashboardSetup />} />
            <Route path="/dashboard/settings" element={<DashboardSettings />} />
            <Route path="/dashboard/management" element={<DashboardManagement />} />
            <Route path="/dashboard/staff" element={<DashboardStaff />} />
            <Route path="/dashboard/customers" element={<DashboardCustomers />} />
          </Route>

          <Route element={<RequireAuth roles={["ADMIN"]} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="/admin/login" element={<AdminLoginPage />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {/* بنر «نصب اپ» مخصوص مرورگر است؛ داخل وب‌ویو پیام‌رسان (مینی‌اپ) جایی ندارد */}
      {!isMiniApp && <PwaInstall />}
    </div>
  );
}

/**
 * اگر کاربر از برگهٔ یک سالن، اپ را نصب کرده باشد، اولین باز کردن اپِ نصب‌شده
 * (حالت standalone) مستقیم همان صفحهٔ سالن را باز می‌کند. در وبِ عادی هیچ کاری نمی‌کند.
 */
function LaunchRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    try {
      if (!window.matchMedia("(display-mode: standalone)").matches) return;
      const path = localStorage.getItem("nobino.launchPath");
      if (path) {
        localStorage.removeItem("nobino.launchPath");
        // مسیر نسبی (مثل /s/mah) با روتر جابه‌جا می‌شود؛ اما آدرس مطلق
        // ساب‌دامین (مثل http://mah.localhost:5175/) با ناوبری کامل باز می‌شود.
        if (path.startsWith("/")) {
          navigate(path);
        } else if (/^https?:\/\//.test(path)) {
          window.location.href = path;
        }
      }
    } catch {
      /* بی‌صدا */
    }
  }, [navigate]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider>
          <ThemeProvider>
            <ScrollToTop />
            <LaunchRedirect />
            <AppInner />
          </ThemeProvider>
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
