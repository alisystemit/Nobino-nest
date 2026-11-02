/**
 * زمینه و ابزارهای مشترک ماژول مینی‌اپ:
 *  - کانفیگ از سوپرادمین (`/api/mini/config`)
 *  - نشست (ورود بی‌حس با initData یا OTP)
 *  - سبد رزرو (در sessionStorage می‌ماند تا رفرش وب‌ویو همه‌چیز را خراب نکند)
 *  - توست یک‌خطی
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
import {
  PLATFORM_LABEL,
  bootWebApp,
  detectPlatform,
  haptic,
  initData as readInitData,
  isDark,
  messengerProfile,
  type MiniPlatformId,
} from "./bridge";
import { hexToRgb } from "./format";

export type MiniUser = {
  id: string;
  phone: string;
  name: string | null;
  email?: string | null;
  role: "CUSTOMER" | "SALON_OWNER" | "AGENT" | "ADMIN";
};

export type MiniPlatformView = {
  id: string;
  label: string;
  emoji: string;
  enabled: boolean;
  installUrl: string;
  silentLogin: boolean;
};

export type MiniConfig = {
  success: boolean;
  error?: string;
  miniUrl: string;
  manageTab: boolean;
  platforms: { id: string; label: string; emoji: string; bot: string; installUrl: string }[];
  brand: { title: string; subtitle: string; accent: string; heroText: string; supportPhone: string; showPrices: boolean };
  features: {
    booking: boolean;
    reviews: boolean;
    manageTab: boolean;
    requireLogin: boolean;
    silentLogin: boolean;
    showFeatured: boolean;
  };
  featured: string[];
  availablePlatforms?: MiniPlatformView[];
};

export const DEFAULT_CONFIG: MiniConfig = {
  success: true,
  miniUrl: "/mini",
  manageTab: true,
  platforms: [],
  brand: {
    title: "نوبینو",
    subtitle: "نوبتگیری آسان از پیام‌رسان",
    accent: "#e11d63",
    heroText: "",
    supportPhone: "",
    showPrices: true,
  },
  features: {
    booking: true,
    reviews: true,
    manageTab: true,
    requireLogin: false,
    silentLogin: true,
    showFeatured: false,
  },
  featured: [],
};

export type Draft = {
  salonId: string;
  slug: string;
  salonName: string;
  timezone: string;
  serviceIds: string[];
  staffId: string;
  staffName: string;
  date: string;
  startAt: string;
  price: number;
  durationMin: number;
};

const EMPTY_DRAFT: Draft = {
  salonId: "",
  slug: "",
  salonName: "",
  timezone: "Asia/Tehran",
  serviceIds: [],
  staffId: "",
  staffName: "",
  date: "",
  startAt: "",
  price: 0,
  durationMin: 0,
};

export type OtpState = "idle" | "sent" | "verified" | "error";

/** مشخصات محلی مشتری (برای پیش‌پرکردن فرم رزرو) — بدون نیاز به endpoint ویرایش پروفایل */
export type LocalProfile = { name: string; phone: string };

const PROFILE_KEY = "nobino.mini.profile";

function readProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { name: "", phone: "" };
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return { name: parsed.name ?? "", phone: parsed.phone ?? "" };
  } catch {
    return { name: "", phone: "" };
  }
}

function writeProfile(profile: LocalProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* حالت خصوصی مرورگر */
  }
}

type MiniContextValue = {
  platform: MiniPlatformId;
  platformLabel: string;
  config: MiniConfig;
  configReady: boolean;
  configError: string;
  reloadConfig: () => Promise<void>;

  me: MiniUser | null;
  authReady: boolean;
  silentLoginTried: boolean;
  messengerName: string;
  refreshMe: () => Promise<MiniUser | null>;
  logout: () => Promise<void>;
  linkMessenger: () => Promise<boolean>;

  draft: Draft;
  setDraft: (patch: Partial<Draft>) => void;
  resetDraft: () => void;

  profile: LocalProfile;
  saveProfile: (patch: Partial<LocalProfile>) => void;

  toast: (message: string, kind?: "info" | "ok" | "error") => void;
  toastNode: ReactNode;
};

const MiniContext = createContext<MiniContextValue | null>(null);

const TOKEN_KEY = "nobino.mini.token";
const DRAFT_KEY = "nobino.mini.draft";

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* حالت خصوصی مرورگر */
  }
}

/** fetch یکسان با Bearer اختیاری و پاسخ envelope */
export async function mapi<T = any>(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T }> {
  const token = readToken();
  // بدنهٔ FormData (آپلود عکس/ویس) باید مرز multipart خودش را داشته باشد،
  // پس content-type دست‌ی ما روی آن نمی‌نشیند.
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { "content-type": "application/json" }),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers });
  } catch {
    return { ok: false, status: 0, data: { success: false, error: "اتصال برقرار نشد" } as T };
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { success: false, raw: text };
  }
  return { ok: res.ok && data?.success !== false, status: res.status, data };
}

export function MiniProvider({ children }: { children: ReactNode }) {
  const platform = useMemo(() => detectPlatform(), []);
  const [config, setConfig] = useState<MiniConfig>(DEFAULT_CONFIG);
  const [configReady, setConfigReady] = useState(false);
  const [configError, setConfigError] = useState("");

  const [me, setMe] = useState<MiniUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [silentLoginTried, setSilentLoginTried] = useState(false);
  const [messengerName, setMessengerName] = useState("");

  const [draft, setDraftState] = useState<Draft>(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : EMPTY_DRAFT;
    } catch {
      return EMPTY_DRAFT;
    }
  });

  const [profile, setProfile] = useState<LocalProfile>(() => readProfile());

  const saveProfile = useCallback((patch: Partial<LocalProfile>) => {
    setProfile((prev) => {
      const next = { ...prev, ...patch };
      writeProfile(next);
      return next;
    });
  }, []);

  const [toastMessage, setToastMessage] = useState<{ text: string; kind: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const toast = useCallback((text: string, kind: "info" | "ok" | "error" = "info") => {
    setToastMessage({ text, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 3200);
  }, []);

  const setAccent = useCallback((hex: string) => {
    const rgb = hexToRgb(hex);
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (rgb) root.style.setProperty("--mini-accent-rgb", rgb);
    root.style.setProperty("--mini-accent", hex);
  }, []);

  const loadConfig = useCallback(async () => {
    const res = await mapi<MiniConfig>("/api/mini/config");
    if (res.ok && res.data?.brand) {
      setConfig(res.data);
      setAccent(res.data.brand.accent);
      setConfigError("");
    } else {
      setConfigError(res.data?.error || "کانفیگ مینی‌اپ خوانده نشد");
    }
    setConfigReady(true);
    bootWebApp(res.data?.brand?.accent ?? DEFAULT_CONFIG.brand.accent);
  }, [setAccent]);

  const refreshMe = useCallback(async () => {
    const res = await mapi<{ success: boolean; user: MiniUser | null }>("/api/auth/me");
    const user = res.ok ? res.data?.user ?? null : null;
    if (!user) writeToken("");
    setMe(user);
    if (user) {
      // پیش‌فرض مهربان: نام و شمارهٔ حساب، جای خالی پروفایل محلی را پر کنند
      setProfile((prev) => {
        const next = { name: prev.name || user.name || "", phone: prev.phone || user.phone || "" };
        if (next.name !== prev.name || next.phone !== prev.phone) writeProfile(next);
        return next;
      });
    }
    return user;
  }, []);

  /** ورود بی‌حس: فقط وقتی داخل پیام‌رسان و ویژگی روشن است */
  const silentLogin = useCallback(async () => {
    setSilentLoginTried(true);
    if (platform === "web" || !config.features.silentLogin) return null;
    const raw = readInitData();
    if (!raw) return null;
    const res = await mapi<{
      success: boolean;
      linked?: boolean;
      needsPhone?: boolean;
      mode?: string;
      token?: string;
      user?: MiniUser;
      profile?: { name?: string; username?: string };
      code?: string;
    }>("/api/mini/session", {
      method: "POST",
      body: JSON.stringify({ platform, initData: raw }),
    });
    const data = res.data ?? {};
    if (data.profile?.name || data.profile?.username) {
      setMessengerName(data.profile.name || data.profile.username || "");
    }
    if (res.ok && data.linked && data.user) {
      writeToken(data.token ?? "");
      setMe(data.user);
      return data.user;
    }
    return null;
  }, [config.features.silentLogin, platform]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await loadConfig();
      if (!alive) return;
      setMessengerName(messengerProfile().name || messengerProfile().username);
      const existing = await refreshMe();
      if (existing || !alive) {
        setAuthReady(true);
        return;
      }
      await silentLogin();
      if (alive) setAuthReady(true);
    })();
    return () => {
      alive = false;
    };
    // loadConfig/silentLogin با تغییر کانفیگ دوباره ساخته می‌شوند
  }, [loadConfig, refreshMe, silentLogin]);

  useEffect(() => {
    const dark = isDark();
    const root = document.getElementById("mini-theme-root");
    if (root) root.classList.toggle("dark", dark);
  }, [configReady]);

  const logout = useCallback(async () => {
    await mapi("/api/auth/logout", { method: "POST" }).catch(() => {});
    writeToken("");
    setMe(null);
  }, []);

  /** اتصال حساب پیام‌رسان به حساب فعلی (برای ورود بی‌حس دفعهٔ بعد) */
  const linkMessenger = useCallback(async () => {
    if (platform === "web") return false;
    const raw = readInitData();
    if (!raw) return false;
    const res = await mapi<{ success: boolean; code?: string }>("/api/mini/link", {
      method: "POST",
      body: JSON.stringify({ platform, initData: raw }),
    });
    if (res.ok) {
      toast("حساب پیام‌رسان متصل شد", "ok");
      haptic("success");
      return true;
    }
    if (res.data?.code === "UNSUPPORTED") toast("این پیام‌رسان اتصال حساب را پشتیبانی نمی‌کند", "error");
    else if (res.data?.code === "BOT_TOKEN_MISSING") toast("توکن ربات در پنل تنظیم نشده است", "error");
    else toast("اتصال حساب ممکن نشد", "error");
    return false;
  }, [platform, toast]);

  const setDraft = useCallback((patch: Partial<Draft>) => {
    setDraftState((prev) => {
      const next = { ...prev, ...patch };
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        /* بی‌اثر */
      }
      return next;
    });
  }, []);

  const resetDraft = useCallback(() => {
    setDraftState(EMPTY_DRAFT);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* بی‌اثر */
    }
  }, []);

  const value = useMemo<MiniContextValue>(
    () => ({
      platform,
      platformLabel: PLATFORM_LABEL[platform],
      config,
      configReady,
      configError,
      reloadConfig: loadConfig,
      me,
      authReady,
      silentLoginTried,
      messengerName,
      refreshMe,
      logout,
      linkMessenger,
      draft,
      setDraft,
      resetDraft,
      profile,
      saveProfile,
      toast,
      toastNode: toastMessage ? (
        <div className={`mini-toast is-${toastMessage.kind}`}>
          <div>{toastMessage.text}</div>
        </div>
      ) : null,
    }),
    [
      platform,
      config,
      configReady,
      configError,
      loadConfig,
      me,
      authReady,
      silentLoginTried,
      messengerName,
      refreshMe,
      logout,
      linkMessenger,
      draft,
      setDraft,
      resetDraft,
      profile,
      saveProfile,
      toast,
      toastMessage,
    ]
  );

  return <MiniContext.Provider value={value}>{children}</MiniContext.Provider>;
}

export function useMini(): MiniContextValue {
  const ctx = useContext(MiniContext);
  if (!ctx) throw new Error("useMini باید داخل MiniProvider استفاده شود");
  return ctx;
}

export { EMPTY_DRAFT, readToken, writeToken };
