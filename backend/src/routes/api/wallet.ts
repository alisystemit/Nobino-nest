// خودکار: پورت‌شده از src/app/api/wallet/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { getWalletSummary } from "@/lib/financial/summary";
import { json, apiError, toJalali } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const wallet = await getWalletSummary(user.id);
    return json({
      success: true,
      wallet: wallet
        ? {
            id: wallet.id,
            balance: wallet.balance,
            currency: wallet.currency,
            transactions: wallet.transactions.map((t) => ({
              id: t.id,
              kind: t.kind,
              reason: t.reason,
              amount: t.amount,
              balanceAfter: t.balanceAfter,
              description: t.description,
              createdAt: toJalali(t.createdAt),
            })),
          }
        : { balance: 0, transactions: [] },
    });
  } catch (err) {
    return apiError(err);
  }
}

const payoutSchema = z.object({
  amount: z.number().int().positive(),
  method: z.string().default("BANK"),
  bankInfo: z.string().optional(),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = payoutSchema.parse(await req.json());

    // کیف پول کاربر
    const wallet = await getWalletSummary(user.id);
    if (!wallet) return json({ success: false, error: "کیف پول یافت نشد" }, { status: 404 });
    if (wallet.balance < body.amount) {
      return json({ success: false, error: "موجودی کافی نیست" }, { status: 400 });
    }

    const payout = await prismaCreatePayout(user.id, body.amount, body.method, body.bankInfo);
    return json({ success: true, payout }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

async function prismaCreatePayout(ownerId: string, amount: number, method: string, bankInfo?: string) {
  // واردات پویا برای جلوگیری از بارگذاری اضافه
  const { prisma } = await import("@/lib/prisma");
  const wallet = await prisma.wallet.findUnique({ where: { ownerId } });
  if (!wallet) throw new Error("کیف پول یافت نشد");

  const balanceAfter = wallet.balance - amount;

  return prisma.$transaction([
    prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { decrement: amount } } }),
    prisma.transaction.create({
      data: {
        walletId: wallet.id,
        kind: "DEBIT",
        reason: "PAYOUT",
        amount,
        balanceAfter,
        refType: "Payout",
        description: "درخواست تسویه حساب",
      },
    }),
    prisma.payout.create({
      data: { walletId: wallet.id, amount, method, bankInfo, status: "REQUESTED" },
    }),
  ]);
}

