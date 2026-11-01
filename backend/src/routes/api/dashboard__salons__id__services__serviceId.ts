// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/services/[serviceId]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  durationMin: z.number().int().positive().optional(),
  price: z.number().int().min(0).optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  bufferMin: z.number().int().min(0).optional(),
  steps: z.array(z.object({ name: z.string(), durationMin: z.number().int().positive() })).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string; serviceId: string } | Promise<{ id: string; serviceId: string }> }) {
  try {
    const { id, serviceId } = await params;
    await requireSalonManage(id);

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || service.salonId !== id) return json({ success: false, error: "service not found" }, { status: 404 });

    const body = patchSchema.parse(await req.json());
    const updated = await prisma.service.update({ where: { id: serviceId }, data: body });
    return json({ success: true, service: updated });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; serviceId: string } | Promise<{ id: string; serviceId: string }> }) {
  try {
    const { id, serviceId } = await params;
    await requireSalonManage(id);

    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service || service.salonId !== id) return json({ success: false, error: "service not found" }, { status: 404 });

    await prisma.service.delete({ where: { id: serviceId } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}