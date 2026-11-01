// خودکار: پورت‌شده از src/app/api/admin/audit/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

/** لاگ حسابرسی با فیلتر (اقدام / نوع موجودیت) */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const action = url.searchParams.get("action")?.trim();
    const entity = url.searchParams.get("entity")?.trim();

    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (entity) where.entityType = { contains: entity, mode: "insensitive" };

    const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 });
    return json({ success: true, logs });
  } catch (err) {
    return apiError(err);
  }
}

