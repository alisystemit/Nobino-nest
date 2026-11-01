/**
 * کمک‌کننده fetch با پاسخ‌دهی هماندازهٔ envelope پروژه ({ success, error })
 */
export type ApiResult<T = any> = { ok: boolean; status: number; data: T };

export async function api<T = any>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let data: any = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { ok: res.ok && data?.success !== false, status: res.status, data };
}
