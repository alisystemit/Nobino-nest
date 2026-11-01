// خودکار: پورت‌شده از src/app/api/admin/salons/[id]/route.ts — بدون تغییر منطق
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** جزئیات کامل یک سالن برای سوپرادمین (نوبت، درآمد، اشتراک، کارکنان، وضعیت) */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await params;

    const salon = await prisma.salon.findUnique({
      where: { id },
      include: {
        owner: { select: { phone: true, name: true, email: true } },
        _count: { select: { appointments: true, staff: true, services: true, branches: true, reviews: true, orders: true } },
      },
    });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const [revenueAgg, subscription, recentAppointments] = await Promise.all([
      prisma.order.aggregate({ where: { salonId: id, status: "PAID" }, _sum: { amount: true } }),
      prisma.subscription.findFirst({ where: { salonId: id, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, include: { package: { select: { name: true, plan: true } } } }),
      prisma.appointment.findMany({ where: { salonId: id }, orderBy: { startAt: "desc" }, take: 10, select: { id: true, customerName: true, startAt: true, status: true } }),
    ]);

    return json({
      success: true,
      salon: {
        ...salon,
        paidRevenue: revenueAgg._sum.amount ?? 0,
        subscription: subscription ? { plan: subscription.package.plan, name: subscription.package.name, endsAt: subscription.endsAt, period: subscription.period } : null,
        recentAppointments,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
