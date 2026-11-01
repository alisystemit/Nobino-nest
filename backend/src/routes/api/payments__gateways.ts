// خودکار: پورت‌شده از src/app/api/payments/gateways/route.ts — بدون تغییر منطق
import { listGateways } from "@/lib/payments/registry";
import { json } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  return json({ success: true, gateways: listGateways() });
}
