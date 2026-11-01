// خودکار: پورت‌شده از src/app/api/admin/discounts/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { json, apiError } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const discounts = await prisma.discount.findMany({ orderBy: { createdAt: "desc" } });
    return json({ success: true, discounts });
  } catch (err) {
    return apiError(err);
  }
}

const createSchema = z.object({
  code: z.string().min(2).max(40),
  percent: z.number().int().min(1).max(100),
  maxUses: z.number().int().min(0).default(0),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = createSchema.parse(await req.json());
    const code = body.code.trim().toUpperCase();

    const existing = await prisma.discount.findUnique({ where: { code } });
    if (existing) return json({ success: false, error: "این کد قبلاً وجود دارد" }, { status: 409 });

    const discount = await prisma.discount.create({
      data: { code, percent: body.percent, maxUses: body.maxUses, expiresAt: body.expiresAt ? new Date(body.expiresAt) : null, isActive: body.isActive },
    });

    await logAudit({ actorId: user.id, actorPhone: user.phone, action: "create_discount", entityType: "Discount", entityId: discount.id, after: { code, percent: body.percent } });

    return json({ success: true, discount }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

