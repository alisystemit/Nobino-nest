// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/holidays/[holidayId]/route.ts — بدون تغییر منطق
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

export async function DELETE(_req: Request, { params }: { params: { id: string; holidayId: string } | Promise<{ id: string; holidayId: string }> }) {
  try {
    const { id, holidayId } = await params;
    await requireSalonManage(id);
    const holiday = await prisma.holiday.findUnique({ where: { id: holidayId }, select: { salonId: true } });
    if (!holiday || holiday.salonId !== id) {
      return json({ success: false, error: "holiday not found" }, { status: 404 });
    }
    await prisma.holiday.delete({ where: { id: holidayId } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}