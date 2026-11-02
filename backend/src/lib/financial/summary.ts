import { prisma } from "@/lib/prisma";
import { TransactionReason } from "@prisma/client";

/** موجودی و خلاصه تراکنش‌های کیف پول کاربر (صفحه‌بندی‌شده) */
export async function getWalletSummary(userId: string, page = 1, limit = 25) {
  const wallet = await prisma.wallet.findUnique({
    where: { ownerId: userId },
  });
  if (!wallet) return null;

  const skip = (page - 1) * limit;
  const [transactions, transactionsTotal, sums] = await Promise.all([
    prisma.transaction.findMany({
      where: { walletId: wallet.id },
      // tiebreaker پایدار: ردیف‌های هم‌زمان (createdAt یکی) بین صفحه‌ها تکرار/جا نمی‌مانند
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: limit,
    }),
    prisma.transaction.count({ where: { walletId: wallet.id } }),
    prisma.transaction.groupBy({
      by: ["kind"],
      where: { walletId: wallet.id },
      _sum: { amount: true },
    }),
  ]);

  const credit = sums.find((s) => s.kind === "CREDIT")?._sum.amount ?? 0;
  const debit = sums.find((s) => s.kind === "DEBIT")?._sum.amount ?? 0;

  return {
    ...wallet,
    transactions,
    transactionsTotal,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(transactionsTotal / limit)),
    summary: { credit, debit },
  };
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
