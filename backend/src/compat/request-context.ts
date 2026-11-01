/**
 * زمینه درخواست (Request Context) مبتنی بر AsyncLocalStorage.
 *
 * کد منطق پروژه (src/lib) در Next با `cookies()` و `headers()` کار می‌کرد.
 * اینجا همان API باقی می‌ماند و این لایه، درخواست جاری را از AsyncLocalStorage
 * می‌خواند؛ به همین دلیل منطق بدون تغییر API مهاجرت کرده است.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { ServerResponse } from "node:http";

/** کوکی‌های دست‌کاری‌شده حین پردازش درخواست */
export type CookieChange = {
  name: string;
  value: string;
  options?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
    path?: string;
    maxAge?: number;
    expires?: Date | string;
    domain?: string;
  };
  deleted?: boolean;
};

export type WebRequestContext = {
  /** همان Web Request استاندارد که route‌ها در Next می‌گرفتند */
  request: Request;
  /** پارامترهای مسیر (هم‌شکل ctx.params در Next 16 — await روی شیء ساده بی‌ضرر است) */
  params: Record<string, string>;
  /** پاسخ Node برای نوشتن Set-Cookie */
  nodeRes: ServerResponse;
  /** کوکی‌های دریافتی از هدر درخواست */
  requestCookies: Map<string, string>;
  /** تغییرات کوکی اعمال‌شده توسط cookies().set/delete */
  cookieChanges: Map<string, CookieChange>;
};

export const requestStore = new AsyncLocalStorage<WebRequestContext>();

export function currentContext(): WebRequestContext {
  const ctx = requestStore.getStore();
  if (!ctx) {
    throw new Error("Request context is not available outside an API request");
  }
  return ctx;
}
