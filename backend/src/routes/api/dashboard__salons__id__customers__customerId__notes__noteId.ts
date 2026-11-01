import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** حذف یادداشت پروندهٔ مشتری — فقط در محدودهٔ همان سالن */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; customerId: string; noteId: string } | Promise<{ id: string; customerId: string; noteId: string }> },
) {
  try {
    const { id, customerId, noteId } = await params;
    await requireSalonManage(id);
    const note = await prisma.salonCustomerNote.findFirst({
      where: { id: noteId, customerId, customer: { salonId: id } },
      select: { id: true },
    });
    if (!note) return json({ success: false, error: "یادداشت یافت نشد" }, { status: 404 });
    await prisma.salonCustomerNote.delete({ where: { id: note.id } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
