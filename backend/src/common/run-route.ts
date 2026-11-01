/**
 * پل Express ↔ Web API:
 *   - ساخت `Request` استاندارد از خام‌ترین streaming Express (بدون body-parser)
 *   - اجرای هندلر مهاجرت‌یافته داخل AsyncLocalStorage
 *   - نوشتن `Response` استاندارد روی پاسخ Express (شامل Set-Cookie و redirect)
 */
import { Readable } from "node:stream";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { requestStore, type WebRequestContext } from "@/compat/request-context";
import { parseCookieHeader, serializeCookie } from "@/compat/next-headers";

/** هدرهایی که نباید عین‌به‌عین از درخواست کلاینت به پاسخ برگردانده/برداشت شوند */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
]);

function absoluteUrl(req: ExpressRequest): string {
  const forwarded = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwarded === "string" && forwarded.length > 0
      ? forwarded.split(",")[0]?.trim() || "http"
      : (req.socket as unknown as { encrypted?: boolean }).encrypted
        ? "https"
        : "http";
  // x-forwarded-host (پروکسی مثل Nginx/vite) مقدم بر Host است؛
  // وگرنه ریدیرکت درگاه به origin بک‌اند می‌افتد نه فرانت
  const fwdHost = req.headers["x-forwarded-host"];
  const host =
    (typeof fwdHost === "string" && fwdHost.trim()) ||
    req.headers.host ||
    `localhost:${req.socket.localPort ?? 3100}`;
  return `${proto}://${host}${req.originalUrl}`;
}

export function buildWebContext(req: ExpressRequest, res: ExpressResponse): WebRequestContext {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else headers.set(name, value);
  }

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req) as ReadableStream;
    init.duplex = "half";
  }

  const context: WebRequestContext = {
    request: new Request(absoluteUrl(req), init),
    params: { ...(req.params as Record<string, string>) },
    nodeRes: res as unknown as import("node:http").ServerResponse,
    requestCookies: parseCookieHeader(req.headers.cookie ?? null),
    cookieChanges: new Map(),
  };
  return context;
}

/**
 * اجرای هندلر مهاجرت‌یافته.
 * هندلرها امضای مسیر را دارند: `(request: Request, ctx: { params }) => Promise<Response>`
 */
export async function runRoute(
  req: ExpressRequest,
  res: ExpressResponse,
  handler: (request: Request, ctx: { params: Record<string, string> }) => Promise<Response>,
): Promise<void> {
  const context = buildWebContext(req, res);
  try {
    const response = await requestStore.run(context, async () =>
      handler(context.request, { params: context.params }),
    );
    await writeWebResponse(context, response);
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    if (status >= 500) console.error("[nobino-api]", error);
    const message = error instanceof Error ? error.message : "خطای ناشناخته";
    const body = new Response(JSON.stringify({ success: false, error: message }), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
    await writeWebResponse(context, body);
  }
}

async function writeWebResponse(ctx: WebRequestContext, response: Response): Promise<void> {
  const res = ctx.nodeRes;
  if (res.headersSent) return;

  res.statusCode = response.status;

  // هدرهای پاسخ (بدون hop-by-hop)
  response.headers.forEach((value, name) => {
    if (HOP_BY_HOP.has(name.toLowerCase())) return;
    res.setHeader(name, value);
  });

  // کوکی‌های تغییریافته حین هندلر
  for (const change of ctx.cookieChanges.values()) {
    res.appendHeader("Set-Cookie", serializeCookie(change));
  }

  // Redirect: Next/undici Location را هدر می‌کند؛ بدنه لازم نیست
  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    res.end();
    return;
  }

  const buffer = await response.arrayBuffer();
  res.end(Buffer.from(buffer));
}
