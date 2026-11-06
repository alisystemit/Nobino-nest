// کنسول عملیات — اجرای استقرار (update.sh). تأیید دو مرحله‌ای در UI؛
// اینجا هم بدنهٔ بدون confirm:true رد می‌شود و سقف نرخ سخت‌تر اعمال می‌شود.
import { z } from "zod";
import { json } from "@/lib/utils";
import { opsGate, startDeploy } from "@/lib/ops-console";

const bodySchema = z.object({ confirm: z.boolean().optional() });

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  const g = await opsGate(req);
  if (g instanceof Response) return g;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || parsed.data.confirm !== true) {
    return json({ success: false, error: "اجرای استقرار بدون تأیید پذیرفته نمی‌شود (confirm: true)." }, { status: 400 });
  }
  return startDeploy(g);
}
