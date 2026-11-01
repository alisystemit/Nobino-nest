/**
 * Shim سازگاری با react-router — APIهای مسیریابی به سبک App Router را روی
 * react-router پیاده می‌کند تا کد مهاجرت‌یافته بدون تغییر کار کند.
 */
import { createElement, useContext } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link as RouterLink, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href?: string;
  to?: string;
  prefetch?: boolean | string;
  replace?: boolean;
  scroll?: boolean;
  children?: ReactNode;
};

export function Link({ href, to, prefetch, scroll, replace: _replace, className, onClick, children, ...rest }: LinkProps) {
  const target = href ?? to ?? "#";
  return createElement(
    RouterLink,
    { to: target, className, onClick, ...rest },
    children,
  );
}

export function useRouter() {
  const navigate = useNavigate();
  const location = useLocation();
  return {
    push: (url: string, _options?: unknown) => navigate(url),
    replace: (url: string, _options?: unknown) => navigate(url, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => window.location.reload(),
    prefetch: async (_url: string) => {},
    pathname: location.pathname,
  };
}

export function usePathname(): string {
  const location = useLocation();
  return location.pathname;
}

/** مشابه App Router: شیء URLSearchParams برمی‌گرداند (نه تاپل react-router) */
export function useSearchParams(): URLSearchParams {
  const location = useLocation();
  return new URLSearchParams(location.search);
}

export function useParamsTyped<T extends Record<string, string>>(): T {
  return useParams() as T;
}

/** خطای کنترلی rewriter — در SPA با Navigate جایگزین می‌شود */
export class RedirectError extends Error {
  constructor(public readonly url: string) {
    super("C_ERR_REDIRECT");
    this.name = "RedirectError";
  }
}

export function redirect(url: string): never {
  throw new RedirectError(url);
}

export class NotFoundError extends Error {
  constructor() {
    super("C_ERR_NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export function notFound(): never {
  throw new NotFoundError();
}

export function NavigateLike({ url }: { url: string }) {
  return createElement(Navigate, { to: url, replace: true });
}

export { RouterLink, useNavigate, useLocation };
export { Navigate };

/** پیش‌فرض Link برای کامپوننت‌های مهاجرت‌شده */
export default Link;
