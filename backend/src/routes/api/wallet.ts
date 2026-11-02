// خودکار: پورت‌شده از src/app/api/wallet/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { getWalletSummary } from "@/lib/financial/summary";
import { json, apiError, toJalali, getPagination } from "@/lib/utils";

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const { page, limit } = getPagination(req.url, 25, 100);
    const wallet = await getWalletSummary(user.id, page, limit);
    // قرارداد صفحه‌بندی: total/page/limit/totalPages در پاسخ (فرانت عدد آ نسازد)
    const totalPages = wallet?.totalPages ?? 1;
    return json({
      success: true,
      page,
      limit,
      total: wallet?.transactionsTotal ?? 0,
      totalPages,
      wallet: wallet
        ? {
            id: wallet.id,
            balance: wallet.balance,
            currency: wallet.currency,
            transactionsTotal: wallet.transactionsTotal,
            page: wallet.page,
            limit: wallet.limit,
            totalPages: wallet.totalPages,
            summary: wallet.summary,
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
        : { balance: 0, transactions: [], transactionsTotal: 0, summary: { credit: 0, debit: 0 } },
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

    const payout = await prismaCreatePayout(user.id, body.amount, body.method, body.bankInfo);
    if (!payout) return json({ success: false, error: "موجودی کافی نیست" }, { status: 400 });
    return json({ success: true, payout }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "INSUFFICIENT_BALANCE") {
      return json({ success: false, error: "موجودی کافی نیست" }, { status: 400 });
    }
    return apiError(err);
  }
}

async function prismaCreatePayout(ownerId: string, amount: number, method: string, bankInfo?: string) {
  // واردات پویا برای جلوگیری از بارگذاری اضافه
  const { prisma } = await import("@/lib/prisma");
  const { debit, ensureWallet } = await import("@/lib/financial/wallet");

  const wallet = await ensureWallet(ownerId);
  const payout = await prisma.payout.create({
    data: { walletId: wallet.id, amount, method, bankInfo, status: "REQUESTED" },
  });

  // برداشت اتمیک (شرط موجودی داخل UPDATE) + ثبت یک تراکنش DEBIT متصل به پیوت
  try {
    await debit(ownerId, amount, "PAYOUT", { refType: "Payout", refId: payout.id, description: "درخواست تسویه حساب" });
  } catch {
    await prisma.payout.delete({ where: { id: payout.id } });
    return null;
  }
  return payout;
}

