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

    const where: Prisma.UserWhereInput = {};
    if (q) where.OR = [{ phone: { contains: q } }, { name: { contains: q } }, { email: { contains: q } }];
    if (roleFilter) where.role = roleFilter as Role;

    const users = await prisma.user.findMany({
      where,
      select: { id: true, phone: true, name: true, email: true, role: true, isActive: true, createdAt: true, loyaltyPoints: true, verifiedAt: true },
      orderBy: { createdAt: "desc" },
      take: 400,
    });
    return json({ success: true, users });
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

