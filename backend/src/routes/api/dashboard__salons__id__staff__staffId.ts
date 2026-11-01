// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/staff/[staffId]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  title: z.string().optional().nullable(),
  role: z.enum(["OWNER", "MANAGER", "RECEPTION", "STYLIST"]).optional(),
  commissionPercent: z.number().int().min(0).max(100).optional(),
  branchId: z.string().optional().nullable(),
  userId: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  specialties: z.array(z.string()).optional(),
  schedule: z.any().optional(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string; staffId: string } | Promise<{ id: string; staffId: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id, staffId } = await params;

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff || staff.salonId !== id) return json({ success: false, error: "کارمند یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN") {
      const salon = await prisma.salon.findUnique({ where: { id } });
      if (!salon || salon.ownerId !== user.id) return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    const body = patchSchema.parse(await req.json());
    const data: Record<string, unknown> = { ...body };
    delete data.serviceIds;
    if (body.serviceIds) {
      data.services = { set: body.serviceIds.map((sid) => ({ id: sid })) };
    }

    const updated = await prisma.staff.update({
      where: { id: staffId },
      data,
      include: { services: true },
    });

    return json({ success: true, staff: updated });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; staffId: string } | Promise<{ id: string; staffId: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id, staffId } = await params;

    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff || staff.salonId !== id) return json({ success: false, error: "کارمند یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN") {
      const salon = await prisma.salon.findUnique({ where: { id } });
      if (!salon || salon.ownerId !== user.id) return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    // نوبت‌های آینده این کارمند آزاد می‌شوند
    await prisma.appointment.updateMany({
      where: { employeeId: staffId, status: { in: ["REQUESTED", "CONFIRMED"] } },
      data: { employeeId: null },
    });
    await prisma.staff.delete({ where: { id: staffId } });

    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
