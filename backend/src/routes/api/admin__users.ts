// خودکار: پورت‌شده از src/app/api/admin/users/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { json, apiError, httpError, enumQueryParam, assertKnownQueryParams } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

const ROLES = ["CUSTOMER", "SALON_OWNER", "AGENT", "ADMIN"] as const;
const USER_FILTERS = ["page", "limit", "q", "role", "isActive"] as const;

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    assertKnownQueryParams(url, USER_FILTERS);
    const q = url.searchParams.get("q")?.trim();
    // مقدار ناشناخته باید 400 بگیرد، نه 500 با متن خام Prisma و نه «بی‌فیلتر»
    const roleFilter = enumQueryParam(url, "role", ROLES, { label: "نقش" });
    const activeRaw = url.searchParams.get("isActive")?.trim();
    let activeParam: boolean | undefined;
    if (activeRaw === "true") activeParam = true;
    else if (activeRaw === "false") activeParam = false;
    else if (activeRaw) throw httpError("مقدار «وضعیت حساب» باید true یا false باشد.", 400);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));

    const where: Prisma.UserWhereInput = {};
    if (q) where.OR = [{ phone: { contains: q } }, { name: { contains: q } }, { email: { contains: q } }];
    if (roleFilter) where.role = roleFilter;
    if (activeParam !== undefined) where.isActive = activeParam;

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

const patchSchema = z
  .object({
    userId: z.string(),
    role: z.enum(["CUSTOMER", "SALON_OWNER", "AGENT", "ADMIN"]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((b) => b.role !== undefined || b.isActive !== undefined, {
    message: "حداقل یکی از «نقش» یا «وضعیت فعال» را بفرستید.",
  });

export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = patchSchema.parse(await req.json());

    const target = await prisma.user.findUnique({ where: { id: body.userId } });
    if (!target) return json({ success: false, error: "کاربر یافت نشد" }, { status: 404 });

    const nextRole = body.role ?? target.role;
    const nextActive = body.isActive ?? target.isActive;
    const losesAdmin = target.role === "ADMIN" && target.isActive && (nextRole !== "ADMIN" || nextActive === false);
    if (losesAdmin) {
      // ادمین نباید خودش را از دسترس پنل خارج کند (قفل کامل، بدون مسیر بازیابی)
      if (target.id === user.id) {
        throw httpError("نمی‌توانید نقش یا وضعیت فعال حساب سوپرادمین خودتان را تغییر دهید.", 400);
      }
      // آخرین سوپرادمین فعال قابل حذف/تعلیق نیست
      const remaining = await prisma.user.count({ where: { role: "ADMIN", isActive: true, id: { not: target.id } } });
      if (remaining === 0) {
        throw httpError("این آخرین سوپرادمین فعال سیستم است؛ ابتدا یک ادمین دیگر بسازید، سپس این حساب را غیرفعال کنید.", 400);
      }
    }

    const updated = await prisma.user.update({ where: { id: body.userId }, data: { role: nextRole, isActive: nextActive } });
    await logAudit({ actorId: user.id, actorPhone: user.phone, action: "update_user", entityType: "User", entityId: body.userId, before: { role: target.role, isActive: target.isActive }, after: { role: updated.role, isActive: updated.isActive } });

    // هرگز رکورد کامل کاربر را برنمی‌گردانیم: `passwordHash` نباید از این مسیر بیرون برود
    return json({
      success: true,
      user: {
        id: updated.id,
        phone: updated.phone,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

