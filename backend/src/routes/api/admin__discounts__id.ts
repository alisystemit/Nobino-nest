// خودکار: پورت‌شده از src/app/api/admin/discounts/[id]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { json, apiError } from "@/lib/utils";

const patchSchema = z.object({
  percent: z.number().int().min(1).max(100).optional(),
  maxUses: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const before = await prisma.discount.findUnique({ where: { id } });
    if (!before) return json({ success: false, error: "کد تخفیف یافت نشد" }, { status: 404 });

    const data: Record<string, unknown> = { ...body };
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

    const discount = await prisma.discount.update({ where: { id }, data });
    await logAudit({ actorId: user.id, actorPhone: user.phone, action: "update_discount", entityType: "Discount", entityId: id, before, after: discount });

    return json({ success: true, discount });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await params;
    const before = await prisma.discount.findUnique({ where: { id } });
    if (!before) return json({ success: false, error: "کد تخفیف یافت نشد" }, { status: 404 });

    await prisma.discount.delete({ where: { id } });
    await logAudit({ actorId: user.id, actorPhone: user.phone, action: "delete_discount", entityType: "Discount", entityId: id, before });

    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
