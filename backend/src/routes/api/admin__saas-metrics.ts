// خودکار: پورت‌شده از src/app/api/admin/saas-metrics/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** شاخص‌های درآمد SaaS: MRR، درآمد، رشد، ریزش، آزمایشی، پلن‌ها */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);

    const now = new Date();

    const [activeSubs, totalSalons, approvedSalons, trialSalons, paidOrders, revenueAgg, usersCount] =
      await Promise.all([
        prisma.subscription.count({ where: { status: "ACTIVE" } }),
        prisma.salon.count(),
        prisma.salon.count({ where: { isApproved: true } }),
        prisma.salon.count({ where: { trialEndsAt: { gt: now } } }),
        prisma.order.count({ where: { status: "PAID" } }),
        prisma.order.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
        prisma.user.count(),
      ]);

    // درآمد ماهانه تکرارشونده: جمع درآمدِ اشتراک‌های فعال (ماهانه معادل)
    const activeSubsData = await prisma.subscription.findMany({
      where: { status: "ACTIVE" },
      include: { package: true },
    });
    const mrr = activeSubsData.reduce((sum, s) => {
      const p = s.package.price;
      return sum + (s.period === "YEARLY" ? Math.round(p / 12) : p);
    }, 0);

    // ریزش: اشتراک‌های لغو/منقضی در ۳۰ روز گذشته
    const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5);
    const churned = await prisma.subscription.count({
      where: { status: { in: ["CANCELLED", "EXPIRED"] }, updatedAt: { gte: thirtyDaysAgo } },
    });

    // توزیع پلن
    const planBreakdown = await prisma.$queryRaw`
      SELECT "plan", COUNT(*)::int AS count
      FROM "Salon"
      WHERE "plan" IS NOT NULL
      GROUP BY "plan"
    `;

    return json({
      success: true,
      metrics: {
        totalSalons,
        approvedSalons,
        activeSubscriptions: activeSubs,
        trialSalons,
        users: usersCount,
        mrr,
        mrrLabel: mrr.toLocaleString("fa-IR"),
        totalRevenue: revenueAgg._sum.amount ?? 0,
        totalRevenueLabel: (revenueAgg._sum.amount ?? 0).toLocaleString("fa-IR"),
        paidOrders,
        churned30d: churned,
        churnRate: activeSubs + churned > 0 ? Math.round((churned / (activeSubs + churned)) * 100) : 0,
        planBreakdown,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

