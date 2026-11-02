/**
 * زمینه نشست کاربر — معادل گرفتن کاربر از سرور.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type SessionUser = {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  role: "CUSTOMER" | "SALON_OWNER" | "AGENT" | "ADMIN";
  avatarUrl?: string | null;
  /** سبک داشبوردی که سوپرادمین برای این حساب انتخاب کرده؛ web = کلاسیک */
  dashboardStyle?: "web" | "mini";
};

type AuthState = {
  me: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<SessionUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  me: null,
  loading: true,
  refresh: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      const data = await res.json();
      const user = (data?.user ?? null) as SessionUser | null;
      setMe(user);
      return user;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    setMe(null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ me, loading, refresh, logout }), [me, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
