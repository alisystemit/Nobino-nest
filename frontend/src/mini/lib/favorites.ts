/**
 * «علاقه‌مندی‌ها» در مینی‌اپ — سالن‌هایی که کاربر خودش انتخاب کرده (با اسکن کیو‌آر،
 * لینک، یا دکمهٔ ♥ روی صفحهٔ سالن).
 *
 * هیچ endpoint تازه‌ای لازم نیست؛ همان سه مسیر سایت که پنل وب هم مصرف می‌کند و همان
 * جدول `Favorite` (یک ردیف به‌ازای هر کاربر×سالن):
 *   GET    /api/favorites?limit=     → { favorites: [{ id, salon: {…} }] }
 *   POST   /api/favorites/:salonId   → افزودن (upsert؛ دوباره فشار دادن خطا نمی‌دهد)
 *   DELETE /api/favorites/:salonId   → حذف
 * هر سه نیازمند نشست‌اند (بدون توکن 401). برای کاربر واردنشده، اسلاگ در
 * localStorage می‌ماند و بعد از ورود اضافه می‌شود.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { mapi } from "./store";

export type FavoriteSalon = {
  id: string;
  slug: string;
  name: string;
  city?: string | null;
  coverColor?: string | null;
  bannerUrl?: string | null;
};

/** سقف منطقی برای فهرست علاقه‌مندی — بیشتر از این روی موبایل خوانده نمی‌شود */
export const MAX_FAVORITES = 20;

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

/**
 * از هر چیزی کاربر می‌چسباند یا دوربین می‌خواند اسلگ در بیاور:
 *   https://mah.example.com/  ·  https://site/s/mah  ·  mah  ·  @mah
 */
export function slugFromAnything(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/^@+/, "");
  if (!value) return "";
  if (SLUG_RE.test(value)) return value;
  let url: URL | null = null;
  try {
    url = new URL(value.startsWith("http") ? value : `https://${value}`);
  } catch {
    url = null;
  }
  if (!url) return "";
  const fromPath = url.pathname.split("/").filter(Boolean).find((p) => SLUG_RE.test(p));
  if (fromPath) return fromPath;
  const host = url.hostname.split(".");
  if (host.length > 2 && SLUG_RE.test(host[0])) return host[0];
  return "";
}

const PENDING_KEY = "nobino.mini.favorites.pending";

/* ── کش مشترک بین همهٔ صفحه‌ها (♥ و خانه و فهرست یک چیز را ببینند) ─── */
let cache: FavoriteSalon[] | null = null;
let inflight: Promise<void> | null = null;
const subs = new Set<(list: FavoriteSalon[]) => void>();

function emit(list: FavoriteSalon[]): void {
  cache = list;
  for (const fn of subs) fn(list);
}

/** اگر پاسخ خطا بود کش را خالی نکن: بعد از ورود دوباره باید تلاش شود */
async function load(force = false): Promise<void> {
  if (cache !== null && !force) return;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    const res = await mapi<{ success: boolean; favorites?: { salon?: FavoriteSalon }[] }>(
      `/api/favorites?limit=${MAX_FAVORITES}`,
    );
    if (res.ok) {
      const rows = Array.isArray(res.data?.favorites) ? res.data.favorites : [];
      emit(rows.map((r) => r.salon).filter((s): s is FavoriteSalon => Boolean(s?.id)));
    }
    inflight = null;
  })();
  return inflight;
}

export function refreshFavorites(): void {
  void load(true);
}

/** کش را دور بریز (خروج/ورود کاربر دیگر) */
export function resetFavorites(): void {
  cache = null;
  for (const fn of subs) fn([]);
}

/** افزودن یک سالن (سطح ماژول تا خانه و ♥ و فهرست یک مسیر را بروند) */
async function addFavorite(salon: FavoriteSalon): Promise<boolean> {
  const current = cache ?? [];
  if (current.some((s) => s.id === salon.id)) return true;
  if (current.length >= MAX_FAVORITES) return false;
  emit([salon, ...current]);
  const res = await mapi<{ success: boolean }>(`/api/favorites/${salon.id}`, { method: "POST" });
  if (!res.ok) emit(current);
  return res.ok;
}

async function removeFavorite(salonId: string): Promise<boolean> {
  const current = cache ?? [];
  emit(current.filter((s) => s.id !== salonId));
  const res = await mapi<{ success: boolean }>(`/api/favorites/${salonId}`, { method: "DELETE" });
  if (!res.ok) emit(current);
  return res.ok;
}

/* ── اسلاگ‌هایی که وقتی کاربر وارد نبود یادداشت شده‌اند ─────────────── */

export function rememberPendingSlug(slug: string): void {
  const value = slug.trim().toLowerCase();
  if (!value) return;
  try {
    const raw = JSON.parse(String(localStorage.getItem(PENDING_KEY) ?? "[]")) as unknown;
    const list = Array.isArray(raw) ? raw.map(String) : [];
    if (!list.includes(value)) list.push(value);
    localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-6)));
  } catch {
    /* حالت خصوصی مرورگر */
  }
}

/** یک‌بار خوانده و پاک می‌شود تا هر بار پشت سر هم اضافه نشود */
export function takePendingSlugs(): string[] {
  try {
    const raw = JSON.parse(String(localStorage.getItem(PENDING_KEY) ?? "[]")) as unknown;
    const list = Array.isArray(raw) ? raw.map(String) : [];
    if (list.length) localStorage.removeItem(PENDING_KEY);
    return list;
  } catch {
    return [];
  }
}

/**
 * سالن‌هایی که با اسکن کیو‌آر یادداشت شده‌اند ولی کاربر هنوز وارد نشده بود؛
 * بعد از ورود، با گرفتن شناسهٔ سالن از مسیر عمومی، به علاقه‌مندی‌ها اضافه می‌شوند.
 */
export async function flushPendingSlugs(): Promise<number> {
  const slugs = takePendingSlugs();
  if (!slugs.length) return 0;
  let added = 0;
  for (const slug of slugs) {
    const res = await mapi<{ success: boolean; salon?: FavoriteSalon }>(`/api/salons/${encodeURIComponent(slug)}`);
    const s = res.ok ? res.data?.salon : undefined;
    if (s?.id && (await addFavorite({ id: s.id, slug: s.slug, name: s.name, city: s.city, coverColor: s.coverColor, bannerUrl: s.bannerUrl }))) added += 1;
  }
  return added;
}

export type FavoritesApi = {
  list: FavoriteSalon[];
  slugs: string[];
  loading: boolean;
  has: (salonId: string) => boolean;
  /** افزودن؛ `false` یعنی نشد (سقف رد شده یا سرور خطا داد) */
  add: (salon: FavoriteSalon) => Promise<boolean>;
  remove: (salonId: string) => Promise<boolean>;
  toggle: (salon: FavoriteSalon) => Promise<boolean>;
  refresh: () => void;
};

export function useFavorites(userId: string | null): FavoritesApi {
  const [list, setList] = useState<FavoriteSalon[]>(cache ?? []);
  const [loading, setLoading] = useState(Boolean(userId) && cache === null);
  const flushed = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      resetFavorites();
      setList([]);
      setLoading(false);
      return;
    }
    const fn = (next: FavoriteSalon[]) => {
      setList(next);
      setLoading(false);
    };
    subs.add(fn);
    setList(cache ?? []);
    if (cache === null) {
      setLoading(true);
      void load();
    }
    // سالن‌هایی که پیش از ورود اسکن شده‌اند، همین‌جا وارد فهرست می‌شوند
    if (flushed.current !== userId) {
      flushed.current = userId;
      void flushPendingSlugs();
    }
    return () => {
      subs.delete(fn);
    };
  }, [userId]);

  const has = useCallback((salonId: string) => list.some((s) => s.id === salonId), [list]);

  const add = useCallback(
    async (salon: FavoriteSalon) => {
      if (!userId) return false;
      return addFavorite(salon);
    },
    [userId],
  );

  const remove = useCallback(
    async (salonId: string) => {
      if (!userId) return false;
      return removeFavorite(salonId);
    },
    [userId],
  );

  const toggle = useCallback(
    async (salon: FavoriteSalon) => (has(salon.id) ? remove(salon.id) : add(salon)),
    [has, remove, add],
  );

  return {
    list,
    slugs: list.map((s) => s.slug),
    loading,
    has,
    add,
    remove,
    toggle,
    refresh: () => {
      void load(true);
    },
  };
}
