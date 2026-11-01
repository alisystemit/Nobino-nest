// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/domain/route.ts — بدون تغییر منطق
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireSalonManage } from "@/lib/auth/guards";
import { withinLimit } from "@/lib/plans/limits";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ customDomain: z.string().min(3).max(255).optional() }).optional();

/** فعال‌سازی درخواست دامنه اختصاصی (ساخت توکن تأیید) */
export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = (schema.parse(await req.json().catch(() => ({}))) ?? {}) as { customDomain?: string };

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    const customDomain = (body.customDomain ?? salon.customDomain ?? "").toLowerCase().trim();
    if (!customDomain) return json({ success: false, error: "customDomain is required" }, { status: 400 });

    const allowed = await withinLimit(id, "customDomain");
    if (!allowed) return json({ success: false, error: "custom domain is not enabled for this plan" }, { status: 403 });

    const domainToken = `nobino-verify-${randomUUID()}`;
    const updated = await prisma.salon.update({
      where: { id },
      data: { customDomain, domainToken, domainStatus: "PENDING" },
    });

    return json({
      success: true,
      salon: updated,
      instructions: {
        type: "TXT",
        host: customDomain,
        value: `nobino-verify=${domainToken}`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}