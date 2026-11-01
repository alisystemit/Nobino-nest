// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/blocks/[blockId]/route.ts — بدون تغییر منطق
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

export async function DELETE(_req: Request, { params }: { params: { id: string; blockId: string } | Promise<{ id: string; blockId: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id, blockId } = await params;

    const block = await prisma.timeBlock.findUnique({ where: { id: blockId } });
    if (!block || block.salonId !== id) return json({ success: false, error: "بازه یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN") {
      const salon = await prisma.salon.findUnique({ where: { id } });
      if (!salon || salon.ownerId !== user.id) return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    await prisma.timeBlock.delete({ where: { id: blockId } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
