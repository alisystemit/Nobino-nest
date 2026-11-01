/**
 * داده‌برگ صفحات — جایگزین بارگذاری داده‌های سمت سرور برای هر صفحه.
 * هندلرها در backend/src/loaders/* قرار دارند و زیر /api/pages/* سرو می‌شوند.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type PageDataState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

export function usePageData<T = Record<string, any>>(
  name: string,
  params: Record<string, string | undefined> = {},
): PageDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const keyRef = useRef("");

  const key = name + "?" + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/pages/${name}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][])}`, { credentials: "same-origin" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || json?.success === false) {
          setError(json?.error ?? `HTTP ${res.status}`);
        } else {
          setData(json?.data ?? json);
        }
      })
      .catch((err) => !cancelled && setError(String(err?.message ?? err)))
      .finally(() => !cancelled && setLoading(false));
    keyRef.current = key;
    return () => {
      cancelled = true;
    };
  }, [key, tick, name]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
