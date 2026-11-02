/**
 * لایهٔ دادهٔ داشبورد مینی‌استایل — دقیقاً همان endpoint های پنل وب را صدا می‌زند.
 *
 * چرا mapiِ ماژول /mini اینجا استفاده نشده؟ چون آن هلپر توکن localStorage
 * مینی‌اپ را به‌عنوان Bearer می‌فرستد؛ در مرورگر یک کاربر ممکن است نشست
 * پیام‌رسان (مثلاً حساب مشتری) با نشست کوکی پنل (حساب آرایشگر) فرق داشته باشد
 * و درخواست‌های داشبورد با هویت اشتباه بروند. این هلپر فقط کوکی هم‌مبدأ را
 * می‌فرستد — همان رفتاری که Dashboard*.tsx های کلاسیک دارند.
 */
export type ApiResult<T = any> = { ok: boolean; status: number; data: T };

export async function dapi<T = any>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { "content-type": "application/json" }),
    ...(((init.headers ?? {}) as Record<string, string>) || {}),
  };
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init, headers });
  } catch {
    return { ok: false, status: 0, data: { success: false, error: "اتصال برقرار نشد" } as unknown as T };
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

/** ساخت query string بدون پارامترهای خالی */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : "";
}
