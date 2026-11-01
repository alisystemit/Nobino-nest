import { prisma } from "@/lib/prisma";
import { TransactionKind, TransactionReason } from "@prisma/client";

/**
 * عملیات کیف پول با رعایت ذخیره‌سازی (trigger در تراکنش).
 */
export async function ensureWallet(userId: string) {
  let wallet = await prisma.wallet.findUnique({ where: { ownerId: userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { ownerId: userId } });
  }
  return wallet;
}

export async function getWallet(userId: string) {
  return ensureWallet(userId);
}

export async function credit(userId: string, amount: number, reason: TransactionReason, opts?: { refType?: string; refId?: string; description?: string }) {
  if (amount <= 0) throw new Error("مبلغ باید مثبت باشد");
  const wallet = await ensureWallet(userId);
  const balanceAfter = wallet.balance + amount;

  const [updated, tx] = await prisma.$transaction([
    prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        kind: TransactionKind.CREDIT,
        reason,
        amount,
        balanceAfter,
        refType: opts?.refType,
        refId: opts?.refId,
        description: opts?.description,
      },
    }),
  ]);

  return { wallet: updated, transaction: tx };
}

export async function debit(userId: string, amount: number, reason: TransactionReason, opts?: { refType?: string; refId?: string; description?: string }) {
  if (amount <= 0) throw new Error("مبلغ باید مثبت باشد");
  const wallet = await ensureWallet(userId);
  if (wallet.balance < amount) throw new Error("موجودی کیف پول کافی نیست");

  const balanceAfter = wallet.balance - amount;
  const [updated, tx] = await prisma.$transaction([
    prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        kind: TransactionKind.DEBIT,
        reason,
        amount,
        balanceAfter,
        refType: opts?.refType,
        refId: opts?.refId,
        description: opts?.description,
      },
    }),
  ]);

  return { wallet: updated, transaction: tx };
}
