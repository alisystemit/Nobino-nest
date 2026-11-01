import { prisma } from "@/lib/prisma";
import { TransactionReason } from "@prisma/client";

/** موجودی و خلاصه تراکنش‌های کیف پول کاربر */
export async function getWalletSummary(userId: string) {
  const wallet = await prisma.wallet.findUnique({
    where: { ownerId: userId },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  return wallet;
}

export async function getCommissionSummary(agentId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { ownerId: agentId } });
  const planCount = await prisma.commissionPlan.count({ where: { agentId, isActive: true } });

  const earned = await prisma.transaction.aggregate({
    where: { walletId: wallet?.id ?? "", reason: TransactionReason.COMMISSION_EARNING },
    _sum: { amount: true },
  });

  const plans = await prisma.commissionPlan.findMany({
    where: { agentId, isActive: true },
    include: { salon: { select: { id: true, name: true, slug: true } } },
  });

  return {
    balance: wallet?.balance ?? 0,
    totalEarned: earned._sum.amount ?? 0,
    activePlanCount: planCount,
    plans,
  };
}
