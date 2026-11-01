// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/webhooks/[webhookId]/route.ts — بدون تغییر منطق
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

export async function DELETE(_req: Request, { params }: { params: { id: string; webhookId: string } | Promise<{ id: string; webhookId: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id, webhookId } = await params;
    const wh = await prisma.webhookConfig.findUnique({ where: { id: webhookId } });
    if (!wh || wh.salonId !== id) return json({ success: false, error: "وب‌هوک یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN") {
      const salon = await prisma.salon.findUnique({ where: { id } });
      if (!salon || salon.ownerId !== user.id) return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }
    await prisma.webhookConfig.delete({ where: { id: webhookId } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
