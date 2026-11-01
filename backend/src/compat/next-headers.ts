/**
 * جایگزین ماژول کوکی/هدرهای سرور برای محیط NestJS.
 * بخشی از API که در این پروژه استفاده می‌شد:
 *   - cookies(): get / set / delete (async، هم‌سuing)
 *   - headers(): get(...)
 */
import { currentContext, type CookieChange } from "@/compat/request-context";

type CookieAttributes = CookieChange["options"];

export type ReadonlyRequestCookie = { name: string; value: string };

function parseCookieHeader(header: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) map.set(name, decodeURIComponent(value));
  }
  return map;
}

/** سریال‌سازی کوکی برای هدر Set-Cookie */
function serializeCookie(change: CookieChange): string {
  const bits: string[] = [`${change.name}=${encodeURIComponent(change.value)}`];
  const opts = change.options ?? {};
  if (change.deleted) bits.push("Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  if (opts.path) bits.push(`Path=${opts.path}`);
  else bits.push("Path=/");
  if (opts.maxAge !== undefined && !change.deleted) bits.push(`Max-Age=${Math.floor(opts.maxAge)}`);
  if (opts.expires && !change.deleted) {
    const exp = opts.expires instanceof Date ? opts.expires : new Date(opts.expires);
    bits.push(`Expires=${exp.toUTCString()}`);
  }
  if (opts.httpOnly) bits.push("HttpOnly");
  if (opts.secure) bits.push("Secure");
  if (opts.sameSite) bits.push(`SameSite=${opts.sameSite}`);
  if (opts.domain) bits.push(`Domain=${opts.domain}`);
  return bits.join("; ");
}

class Cookies {
  private ctx = currentContext();

  get(name: string): ReadonlyRequestCookie | undefined {
    const value = this.ctx.requestCookies.get(name) ?? this.ctx.cookieChanges.get(name)?.value;
    if (value === undefined) return undefined;
    return { name, value };
  }

  getAll(): ReadonlyRequestCookie[] {
    return Array.from(this.ctx.requestCookies.keys()).map((name) => this.get(name)!);
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  set(name: string, value: string, options?: CookieAttributes): void;
  set(cookie: ReadonlyRequestCookie & { options?: CookieAttributes }): void;
  set(a: string | ReadonlyRequestCookie & { options?: CookieAttributes }, b?: string, c?: CookieAttributes): void {
    if (typeof a === "string") {
      this.apply({ name: a, value: b ?? "", options: c });
    } else {
      this.apply({ name: a.name, value: a.value, options: a.options });
    }
  }

  delete(name: string): void;
  delete(cookie: { name: string }): void;
  delete(a: string | { name: string }): void {
    const name = typeof a === "string" ? a : a.name;
    this.apply({ name, value: "", deleted: true });
  }

  private apply(change: CookieChange) {
    this.ctx.cookieChanges.set(change.name, change);
    if (change.deleted) this.ctx.requestCookies.delete(change.name);
    else this.ctx.requestCookies.set(change.name, change.value);
  }
}

export async function cookies(): Promise<Cookies> {
  return new Cookies();
}

export async function headers(): Promise<Headers> {
  const ctx = currentContext();
  return ctx.request.headers;
}

export { parseCookieHeader, serializeCookie };
