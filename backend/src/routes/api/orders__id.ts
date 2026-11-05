// وضعیت سفارش برای صاحب آن — منبع حقیقت صفحهٔ نتیجهٔ پرداخت
// (صفحه نباید نتیجه را از query کلاینت بگیرد؛ سفارش از سرور خوانده می‌شود)
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        status: true,
        amount: true,
        originalAmount: true,
        period: true,
        packageId: true,
        salonId: true,
        createdAt: true,
      },
    });
    if (!order) return json({ success: false, error: "سفارش یافت نشد" }, { status: 404 });
    // فقط خریدار (یا سوپرادمین) می‌تواند وضعیت را ببیند
    if (user.role !== "ADMIN" && order.userId !== user.id) {
      return json({ success: false, error: "سفارش یافت نشد" }, { status: 404 });
    }
    const { userId: _userId, ...safe } = order;
    return json({ success: true, order: safe });
  } catch (err) {
    return apiError(err);
  }
}
