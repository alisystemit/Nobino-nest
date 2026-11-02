/**
 * زمینهٔ داشبورد مینی‌استایل: کاربر، سالن فعال، آمار، توست و کنترل سبک.
 *
 * عمداً مستقل از MiniProvider ماژول /mini نوشته شده (آن برای پیام‌رسان است و با
 * توکن Bearer کار می‌کند) اما همان اجزای ظاهری و همان endpoint های پنل وب را
 * مصرف می‌کند: دادهٔ سالن از بارگذاری /api/pages/dashboard-salon می‌آید — دقیقاً
 * مثل نسخهٔ کلاسیک — تا دو نسخهٔ داشبورد همیشه یک دادهٔ یکسان نشان دهند.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth, type SessionUser } from "@/auth";
import { usePageData } from "@/lib/page-data";
import { hexToRgb } from "@/mini/lib/format";
import type { DashboardStats } from "@/mini/lib/types";
import { dapi } from "./api";

/** خلاصهٔ سالن در سوییچر بالای داشبورد */
export type DashSalonOption = { id: string; name: string };

/** همان چیزی که بارگذاری dashboard-salon برمی‌گرداند (فیلدهای پرکاربرد تایپ شده) */
export type DashSalonPayload = {
  redirect?: string;
  mode?: "create" | "salon";
  mySalons?: DashSalonOption[];
  salon?: any;
  snap?: {
    planLabel: string;
    counts: { key: string; label: string; icon: string; used: number; limit: number }[];
    bools: { key: string; label: string; icon: string; on: boolean }[];
  };
  publicUrl?: string;
};

const SALON_KEY = "nobino.dash.salon";

function storageGet(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* حالت خصوصی مرورگر */
  }
}

/* میان‌بُر «نسخهٔ وب این تب» — پیاده‌سازی در ./classic.ts است و از همان‌جا بازنشر می‌شود */
export { classicWanted, requestClassic, leaveClassic } from "./classic";

export function canRoleManage(role?: string | null): boolean {
  return role === "SALON_OWNER" || role === "ADMIN" || role === "AGENT";
}

type DashContextValue = {
  me: SessionUser | null;
  authReady: boolean;
  refreshMe: () => Promise<SessionUser | null>;
  canManage: boolean;
  isSuperAdmin: boolean;

  /** دادهٔ سالن از بارگذاری پنل وب (mode=create یعنی هنوز سالنی ساخته نشده) */
  payload: DashSalonPayload | null;
  payloadLoading: boolean;
  reloadPayload: () => void;
  salon: any | null;
  mySalons: DashSalonOption[];

  salonId: string;
  setSalonId: (id: string) => void;

  stats: DashboardStats | null;
  statsLoading: boolean;
  reloadStats: () => void;

  /** سبک جاری (تصمیم سوپرادمین) و نوشتن اورراید همین سالن */
  style: "web" | "mini";
  salonStyleOverride: "" | "web" | "mini";
  setSalonStyleOverride: (value: "" | "web" | "mini") => Promise<boolean>;

  toast: (message: string, kind?: "info" | "ok" | "error") => void;
  toastNode: ReactNode;
};

const DashContext = createContext<DashContextValue | null>(null);

export function DashProvider({ children }: { children: ReactNode }) {
  const { me, loading, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const authReady = !loading;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [override, setOverride] = useState<"" | "web" | "mini">("");

  const [toastMessage, setToastMessage] = useState<{ text: string; kind: string } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const toast = useCallback((text: string, kind: "info" | "ok" | "error" = "info") => {
    setToastMessage({ text, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 3200);
  }, []);

  const canManage = canRoleManage(me?.role);
  const isSuperAdmin = me?.role === "ADMIN";

  /* سالن فعال: ?salon= ← انتخاب قبلی ← سالنی که بارگذاری سرور برگزیده */
  const paramSalon = params.get("salon") ?? "";
  const storedSalon = storageGet(SALON_KEY);

  const { data, loading: payloadLoading, reload } = usePageData<DashSalonPayload>(
    "dashboard-salon",
    canManage ? { salon: paramSalon || storedSalon || undefined } : {}
  );

  const payload = data ?? null;
  const mySalons = useMemo(() => payload?.mySalons ?? [], [payload]);
  const salon = payload?.salon ?? null;

  const salonId = useMemo(() => {
    if (paramSalon && (!mySalons.length || mySalons.some((s) => s.id === paramSalon))) return paramSalon;
    if (salon?.id) return String(salon.id);
    if (storedSalon && mySalons.some((s) => s.id === storedSalon)) return storedSalon;
    return mySalons[0]?.id ?? "";
  }, [paramSalon, mySalons, salon?.id, storedSalon]);

  const setSalonId = useCallback(
    (id: string) => {
      storageSet(SALON_KEY, id);
      const next = new URLSearchParams(params);
      if (id) next.set("salon", id);
      else next.delete("salon");
      setParams(next, { replace: true });
      reload();
      void loadStats();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, setParams, reload]
  );

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    const res = await dapi<{ success: boolean; error?: string; stats?: DashboardStats }>("/api/dashboard/stats");
    if (res.ok && res.data?.stats) setStats(res.data.stats);
    setStatsLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady || !me) {
      setStatsLoading(false);
      return;
    }
    void loadStats();
  }, [authReady, me, loadStats]);

  /* رنگ برند از همان کانفیگ عمومی مینی‌اپ (--mini-accent روی <html> می‌نشیند) */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await dapi<{ brand?: { accent?: string } }>("/api/mini/config");
      const accent = alive ? res.data?.brand?.accent : "";
      if (!accent || typeof document === "undefined") return;
      const root = document.documentElement;
      root.style.setProperty("--mini-accent", accent);
      const rgb = hexToRgb(accent);
      if (rgb) root.style.setProperty("--mini-accent-rgb", rgb);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** اورراید سبک همین سالن (کلید dashboard.style.salon.<id>) — فقط سوپرادمین */
  const setSalonStyleOverride = useCallback(
    async (value: "" | "web" | "mini"): Promise<boolean> => {
      if (!salonId) return false;
      const update = value
        ? { key: `dashboard.style.salon.${salonId}`, value, group: "general", type: "select" }
        : { key: `dashboard.style.salon.${salonId}`, clear: true, group: "general", type: "select" };
      const res = await dapi<{ success: boolean; error?: string }>("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ updates: [update] }),
      });
      if (!res.ok) {
        toast(res.data?.error || "ذخیرهٔ سبک ممکن نشد", "error");
        return false;
      }
      setOverride(value);
      toast(
        value === "mini" ? "این سالن با سبک مینی‌اپ باز می‌شود" : value === "web" ? "این سالن با سبک وب باز می‌شود" : "بازگشت به پیش‌فرض سراسری",
        "ok"
      );
      // cache هشت‌ثانیه‌ای تنظیمات سرور را رد می‌کنیم تا /api/auth/me مقدار تازه بدهد
      await refresh();
      return true;
    },
    [salonId, toast, refresh]
  );

  const style: "web" | "mini" = override || me?.dashboardStyle || "web";

  const value = useMemo<DashContextValue>(
    () => ({
      me,
      authReady,
      refreshMe: refresh,
      canManage,
      isSuperAdmin,
      payload,
      payloadLoading,
      reloadPayload: reload,
      salon,
      mySalons,
      salonId,
      setSalonId,
      stats,
      statsLoading,
      reloadStats: () => void loadStats(),
      style,
      salonStyleOverride: override,
      setSalonStyleOverride,
      toast,
      toastNode: toastMessage ? (
        <div className={`mini-toast is-${toastMessage.kind}`}>
          <div>{toastMessage.text}</div>
        </div>
      ) : null,
    }),
    [
      me,
      authReady,
      refresh,
      canManage,
      isSuperAdmin,
      payload,
      payloadLoading,
      reload,
      salon,
      mySalons,
      salonId,
      setSalonId,
      stats,
      statsLoading,
      loadStats,
      style,
      override,
      setSalonStyleOverride,
      toast,
      toastMessage,
    ]
  );

  return <DashContext.Provider value={value}>{children}</DashContext.Provider>;
}

export function useDash(): DashContextValue {
  const ctx = useContext(DashContext);
  if (!ctx) throw new Error("useDash باید داخل DashProvider استفاده شود");
  return ctx;
}
