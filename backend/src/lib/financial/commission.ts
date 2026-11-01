import { prisma } from "@/lib/prisma";
import { credit } from "@/lib/financial/wallet";
import { TransactionReason } from "@prisma/client";

/**
 * محاسبه و ثبت کمیسیون نماینده (درصدی) از یک مبلغ.
 */
export async function applyCommissionOnAmount(params: {
  agentId: string;
  salonId: string;
  amount: number; // مبلغ مبنا (مثلاً مبلغ فروش پکیج)
}) {
  const plan = await prisma.commissionPlan.findFirst({
    where: { agentId: params.agentId, salonId: params.salonId, isActive: true },
  });
  if (!plan) return null;

  const commissionAmount = Math.round((params.amount * plan.percent) / 100);
  if (commissionAmount <= 0) return null;

  const { transaction } = await credit(params.agentId, commissionAmount, TransactionReason.COMMISSION_EARNING, {
    refType: "Salon",
    refId: params.salonId,
    description: `کمیسیون ${plan.percent}٪ از فروش سالن`,
  });

  return { amount: commissionAmount, percent: plan.percent, transactionId: transaction.id };
}

export async function listCommissions(agentId: string) {
  return prisma.commissionPlan.findMany({
    where: { agentId },
    include: { salon: true },
  });
}
