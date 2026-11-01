// خودکار: پورت‌شده از src/app/api/admin/subscriptions/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { cancelSubscription } from "@/lib/subscriptions";
import { z } from "zod";
import { json, apiError, getPagination } from "@/lib/utils";

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const { page, limit, skip, take } = getPagination(req.url, 25, 200);
    const statusFilter = new URL(req.url).searchParams.get("status") ?? "";
    const where = statusFilter === "ACTIVE" || statusFilter === "SUSPENDED" || statusFilter === "CANCELLED" || statusFilter === "EXPIRED"
      ? { status: statusFilter }
      : {};
    const [subscriptions, total, statusCounts] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: { salon: { select: { name: true, slug: true, phone: true } }, package: { select: { name: true, plan: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.subscription.count({ where }),
      prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const counts = { ACTIVE: 0, SUSPENDED: 0, CANCELLED: 0, EXPIRED: 0 } as Record<string, number>;
    for (const c of statusCounts) counts[c.status] = c._count._all;
    return json({ success: true, subscriptions, total, page, limit, counts });
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

