// خودکار: پورت‌شده از src/app/api/admin/users/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { json, apiError } from "@/lib/utils";
import type { Prisma, Role } from "@prisma/client";

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const roleFilter = url.searchParams.get("role")?.trim();
    const activeParam = url.searchParams.get("isActive")?.trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));

    const where: Prisma.UserWhereInput = {};
    if (q) where.OR = [{ phone: { contains: q } }, { name: { contains: q } }, { email: { contains: q } }];
    if (roleFilter) where.role = roleFilter as Role;
    if (activeParam === "true") where.isActive = true;
    else if (activeParam === "false") where.isActive = false;

    const select = {
      id: true,
      phone: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      loyaltyPoints: true,
      verifiedAt: true,
      wallets: { take: 1, select: { balance: true } },
      _count: { select: { ownedSalons: true, orders: true } },
    };

    // آمار کل (بدون فیلتر) برای کارت‌های خلاصه و توزیع نقش
    const [active, suspended, byRole, totalAll] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.user.count(),
    ]);

    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, select, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      prisma.user.count({ where }),
    ]);

    const roleCounts: Record<string, number> = {};
    for (const r of byRole) roleCounts[r.role] = r._count._all;

    return json({
      success: true,
      users,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      counts: { total: totalAll, active, suspended, byRole: roleCounts },
    });
  } catch (err) {
    return apiError(err);
  }
}

const patchSchema = z.object({
  userId: z.string(),
  role: z.enum(["CUSTOMER", "SALON_OWNER", "AGENT", "ADMIN"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = patchSchema.parse(await req.json());

    const target = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!target) return json({ success: false, error: "کاربر یافت نشد" }, { status: 404 });

    const updated = await prisma.user.update({ where: { id: body.userId }, data: { role: body.role, isActive: body.isActive } });
    await logAudit({ actorId: user.id, actorPhone: user.phone, action: "update_user", entityType: "User", entityId: body.userId, before: { role: target.role, isActive: target.isActive }, after: { role: updated.role, isActive: updated.isActive } });

    return json({ success: true, user: updated });
  } catch (err) {
    return apiError(err);
  }
}

