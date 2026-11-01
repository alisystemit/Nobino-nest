// خودکار: پورت‌شده از src/app/api/admin/salons/[id]/status/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  isApproved: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/** تأیید / تعلیق / غیرفعال‌سازی سالن توسط سوپرادمین */
export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await params;
    const body = schema.parse(await req.json());

    const before = await prisma.salon.findUnique({ where: { id } });
    if (!before) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const salon = await prisma.salon.update({ where: { id }, data: body });
    await logAudit({ actorId: user.id, actorPhone: user.phone, action: "change_salon_status", entityType: "Salon", entityId: id, before, after: { isApproved: salon.isApproved, isActive: salon.isActive } });

    return json({ success: true, salon });
  } catch (err) {
    return apiError(err);
  }
}
