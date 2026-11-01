// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/branches/[branchId]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string; branchId: string } | Promise<{ id: string; branchId: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id, branchId } = await params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.salonId !== id) return json({ success: false, error: "شعبه یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN") {
      const salon = await prisma.salon.findUnique({ where: { id } });
      if (!salon || salon.ownerId !== user.id) return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }
    const body = patchSchema.parse(await req.json());
    const updated = await prisma.branch.update({ where: { id: branchId }, data: body });
    return json({ success: true, branch: updated });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; branchId: string } | Promise<{ id: string; branchId: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id, branchId } = await params;
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch || branch.salonId !== id) return json({ success: false, error: "شعبه یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN") {
      const salon = await prisma.salon.findUnique({ where: { id } });
      if (!salon || salon.ownerId !== user.id) return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }
    await prisma.branch.delete({ where: { id: branchId } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
