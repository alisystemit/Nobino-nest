// خودکار: پورت‌شده از src/app/api/admin/subscriptions/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { cancelSubscription } from "@/lib/subscriptions";
import { z } from "zod";
import { json, apiError } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const subscriptions = await prisma.subscription.findMany({
      include: { salon: { select: { name: true, slug: true, phone: true } }, package: { select: { name: true, plan: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return json({ success: true, subscriptions });
  } catch (err) {
    return apiError(err);
  }
}

const cancelSchema = z.object({ status: z.enum(["CANCELLED", "SUSPENDED"]) });

export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const subId = body.subscriptionId as string;
    const parsed = cancelSchema.parse(body);
    const updated = await cancelSubscription(subId, parsed.status);
    if (!updated) return json({ success: false, error: "اشتراک یافت نشد" }, { status: 404 });
    return json({ success: true, subscription: updated });
  } catch (err) {
    return apiError(err);
  }
}

