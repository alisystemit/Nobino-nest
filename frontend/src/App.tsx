/**
 * بد اپلیکیشن SPA — معادل layout.tsx نسخه Next + جدول مسیرها.
 */
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/auth";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
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
import DashboardHome from "@/pages/DashboardHome";
import DashboardAccount from "@/pages/DashboardAccount";
import DashboardAppointments from "@/pages/DashboardAppointments";
import DashboardNewAppointment from "@/pages/DashboardNewAppointment";
import DashboardVoiceBooking from "@/pages/DashboardVoiceBooking";
import DashboardWallet from "@/pages/DashboardWallet";
import DashboardCommission from "@/pages/DashboardCommission";
import DashboardSalon from "@/pages/DashboardSalon";
import AdminPage from "@/pages/AdminPage";
import AdminLoginPage from "@/pages/AdminLoginPage";

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

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider>
          <ThemeProvider>
            <ScrollToTop />
            <div className="flex min-h-full flex-col bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
              <GlobalHeader />
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

                <Route element={<RequireAuth />}>
                  <Route path="/dashboard" element={<DashboardHome />} />
                  <Route path="/dashboard/account" element={<DashboardAccount />} />
                  <Route path="/dashboard/appointments" element={<DashboardAppointments />} />
                  <Route path="/dashboard/wallet" element={<DashboardWallet />} />
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
                </Route>

                <Route element={<RequireAuth roles={["ADMIN"]} />}>
                  <Route path="/admin" element={<AdminPage />} />
                </Route>
                <Route path="/admin/login" element={<AdminLoginPage />} />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <PwaInstall />
            </div>
          </ThemeProvider>
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
