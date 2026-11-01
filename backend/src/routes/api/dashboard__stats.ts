// خودکار: پورت‌شده از src/app/api/dashboard/stats/route.ts — بدون تغییر منطق


import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getWalletSummary } from "@/lib/financial/summary";
import { json, apiError } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();

    if (user.role === "ADMIN") {
      const [salons, customers, orders, paidOrders] = await Promise.all([
        prisma.salon.count(),
        prisma.user.count({ where: { role: "CUSTOMER" } }),
        prisma.order.count(),
        prisma.order.aggregate({
          where: { status: "PAID" },
          _sum: { amount: true },
        }),
      ]);
      return json({
        success: true,
        stats: {
          salons,
          customers,
          orders,
          revenue: paidOrders._sum.amount ?? 0,
        },
      });
    }

    if (user.role === "SALON_OWNER") {
      const salon = await prisma.salon.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
      if (!salon) return json({ success: true, stats: { hasSalon: false } });

      const [total, today, pending] = await Promise.all([
        prisma.appointment.count({ where: { salonId: salon.id } }),
        prisma.appointment.count({
          where: { salonId: salon.id, startAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lt: new Date(new Date().setHours(23, 59, 59, 999)) } },
        }),
        prisma.appointment.count({ where: { salonId: salon.id, status: "REQUESTED" } }),
      ]);

      const wallet = await getWalletSummary(user.id);

      return json({
        success: true,
        stats: { hasSalon: true, salonId: salon.id, slug: salon.slug, total, today, pending, balance: wallet?.balance ?? 0 },
      });
    }

    // AGENT
    const wallet = await getWalletSummary(user.id);
    const plans = await prisma.commissionPlan.count({ where: { agentId: user.id, isActive: true } });
    return json({
      success: true,
      stats: { plans, balance: wallet?.balance ?? 0 },
    });
  } catch (err) {
    return apiError(err);
  }
}

