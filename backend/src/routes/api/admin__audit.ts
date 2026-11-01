// خودکار: پورت‌شده از src/app/api/admin/audit/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

/** لاگ حسابرسی با فیلتر (اقدام / نوع موجودیت) */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const action = url.searchParams.get("action")?.trim();
    const entity = url.searchParams.get("entity")?.trim();
    const { page, limit, skip, take } = getPagination(req.url, 25, 200);

    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (entity) where.entityType = { contains: entity, mode: "insensitive" };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      prisma.auditLog.count({ where }),
    ]);

    // ─── غنی‌سازی: به‌دست آوردن نام موجودیت‌ها (سالن/کاربر/پکیج/تخفیف/نظر) ───
    const byType = new Map<string, string[]>();
    logs.forEach((l) => {
      if (!l.entityId) return;
      const arr = byType.get(l.entityType) ?? [];
      arr.push(l.entityId);
      byType.set(l.entityType, arr);
    });

    const entityNames = new Map<string, string>();
    for (const [type, ids] of byType) {
      const uniq = Array.from(new Set(ids));
      if (type === "Salon") {
        const rows = await prisma.salon.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
        rows.forEach((r) => entityNames.set(`${type}:${r.id}`, r.name));
      } else if (type === "User") {
        const rows = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true, phone: true } });
        rows.forEach((r) => entityNames.set(`${type}:${r.id}`, r.name ?? r.phone));
      } else if (type === "Package") {
        const rows = await prisma.package.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
        rows.forEach((r) => entityNames.set(`${type}:${r.id}`, r.name));
      } else if (type === "Discount") {
        const rows = await prisma.discount.findMany({ where: { id: { in: uniq } }, select: { id: true, code: true } });
        rows.forEach((r) => entityNames.set(`${type}:${r.id}`, r.code));
      } else if (type === "Review") {
        const rows = await prisma.review.findMany({
          where: { id: { in: uniq } },
          select: { id: true, salon: { select: { name: true } } },
        });
        rows.forEach((r) => {
          if (r.salon?.name) entityNames.set(`${type}:${r.id}`, r.salon.name);
        });
      }
    }

    // ─── غنی‌سازی: نام اقدام‌کننده (ادمین) ───
    const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter((x): x is string => Boolean(x))));
    const actorNames = new Map<string, string>();
    if (actorIds.length) {
      const rows = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, phone: true } });
      rows.forEach((r) => actorNames.set(r.id, r.name ?? r.phone));
    }

    const enriched = logs.map((l) => ({
      ...l,
      entityName: l.entityId ? (entityNames.get(`${l.entityType}:${l.entityId}`) ?? null) : null,
      actorName: l.actorId ? (actorNames.get(l.actorId) ?? null) : null,
    }));
    return json({ success: true, logs: enriched, total, page, limit });
  } catch (err) {
    return apiError(err);
  }
}

