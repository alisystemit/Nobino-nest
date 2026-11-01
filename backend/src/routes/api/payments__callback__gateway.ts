// خودکار: پورت‌شده از src/app/api/payments/callback/[gateway]/route.ts — بدون تغییر منطق
import { handlePaymentCallback } from "@/lib/payments/engine";
import { getGateway } from "@/lib/payments/registry";

function collectParams(url: string, body?: Record<string, string>): Record<string, string> {
  const u = new URL(url);
  const params: Record<string, string> = {};
  u.searchParams.forEach((v, k) => {
    params[k] = v;
  });
  if (body) Object.assign(params, body);
  return params;
}

function redirectTo(origin: string, path: string) {
  return Response.redirect(new URL(path, origin).toString());
}

export async function GET(req: Request, { params }: { params: { gateway: string } | Promise<{ gateway: string }> }) {
  const { gateway } = await params;
  getGateway(gateway);
  const search = collectParams(req.url);
  const orderId = search.order ?? search.OrderId ?? "";
  const invoiceId = search.invoice ?? search.InvoiceId ?? "";
  const authority = search.authority ?? search.RefId ?? search.token ?? search.Token ?? "";

  const result = await handlePaymentCallback({ gatewayId: gateway, orderId, invoiceId, authority, searchParams: search });

  const base = search.redirect ?? "/payment/result";
  const origin = new URL(req.url).origin;
  if (result.success) {
    return redirectTo(origin, `${base}?status=success&ref=${result.companyId}`);
  }
  return redirectTo(origin, `${base}?status=failed&reason=${encodeURIComponent(result.message ?? "")}`);
}

export async function POST(req: Request, { params }: { params: { gateway: string } | Promise<{ gateway: string }> }) {
  const { gateway } = await params;
  let body: Record<string, string> | undefined;
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const obj = await req.json();
      body = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, String(v)]));
    } else {
      const form = await req.formData();
      body = {};
      for (const [k, v] of form.entries()) {
        if (typeof v === "string") body[k] = v;
      }
    }
  } catch {
    body = undefined;
  }

  const search = collectParams(req.url, body);
  const orderId = search.order ?? search.OrderId ?? "";
  const invoiceId = search.invoice ?? search.InvoiceId ?? "";
  const authority = search.authority ?? search.RefId ?? search.token ?? search.Token ?? "";

  const result = await handlePaymentCallback({ gatewayId: gateway, orderId, invoiceId, authority, searchParams: search });

  const base = search.redirect ?? "/payment/result";
  const origin = new URL(req.url).origin;
  if (result.success) {
    return redirectTo(origin, `${base}?status=success&ref=${result.companyId}`);
  }
  return redirectTo(origin, `${base}?status=failed&reason=${encodeURIComponent(result.message ?? "")}`);
}
