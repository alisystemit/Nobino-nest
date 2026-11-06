import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/utils";
import { assertMoney } from "@/lib/money";
import { Prisma, TransactionKind, TransactionReason } from "@prisma/client";

/**
 * عملیات کیف پول با ثبت هم‌زمان دفترکل.
 *
 * همهٔ توابع اختیاری `client` می‌گیرند تا فراخوانِ داخل یک `$transaction`
 * تعاملی بتواند همان تراکنش را پاس بدهد (وگرنه قلم‌ها جدا نوشته می‌شوند).
 * بدون client، خودِ تابع یک تراکنش تعاملی باز می‌کند.
 */
type Db = Prisma.TransactionClient;

export async function ensureWallet(userId: string, client: Db = prisma) {
  const existing = await client.wallet.findUnique({ where: { ownerId: userId } });
  if (existing) return existing;
  // upsert تا دو ساخت هم‌زمان روی @@unique([ownerId]) خطای race ندهد
  return client.wallet.upsert({ where: { ownerId: userId }, update: {}, create: { ownerId: userId } });
}

export async function getWallet(userId: string) {
  return ensureWallet(userId);
}

/**
 * افزایش موجودی به‌همراه ردیف دفترکل، هر دو داخل یک تراکنش.
 *
 * نکته (O10): `balanceAfter` هرگز از خواندنِ قبلی حساب نمی‌شود؛ بعد از
 * `increment` خودِ ردیف را می‌خوانیم. UPDATE روی ردیف کیف پول قفل می‌گیرد، پس
 * دو واریز هم‌زمان صف می‌شوند و عدد دفترکل با موجودی واقعی می‌خواند.
 */
export async function credit(
  userId: string,
  amount: number,
  reason: TransactionReason,
  opts?: { refType?: string; refId?: string; description?: string },
  client?: Db
) {
  if (amount <= 0) throw httpError("مبلغ باید مثبت باشد", 400);
  assertMoney(amount, "مبلغ تراکنش");

  const run = async (db: Db) => {
    const wallet = await ensureWallet(userId, db);
    const updated = await db.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    const ledger = await db.transaction.create({
      data: {
        walletId: updated.id,
        kind: TransactionKind.CREDIT,
        reason,
        amount,
        balanceAfter: updated.balance,
        refType: opts?.refType,
        refId: opts?.refId,
        description: opts?.description,
      },
    });
    return { wallet: updated, transaction: ledger };
  };

  return client ? run(client) : prisma.$transaction((tx) => run(tx));
}

/**
 * برداشت با شرط موجودی داخل خودِ UPDATE (ضد TOCTOU) و ردیف دفترکل در همان
 * تراکنش. اگر موجودی نرسد خطا می‌دهد و نوشتن‌های آن تراکنش رول‌بک می‌شود.
 */
export async function debit(
  userId: string,
  amount: number,
  reason: TransactionReason,
  opts?: { refType?: string; refId?: string; description?: string },
  client?: Db
) {
  if (amount <= 0) throw httpError("مبلغ باید مثبت باشد", 400);
  assertMoney(amount, "مبلغ تراکنش");

  const run = async (db: Db) => {
    const wallet = await ensureWallet(userId, db);
    const res = await db.wallet.updateMany({
      where: { id: wallet.id, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (res.count !== 1) throw httpError("موجودی کیف پول کافی نیست", 400);

    const updated = await db.wallet.findUnique({ where: { id: wallet.id } });
    if (!updated) throw httpError("کیف پول یافت نشد", 400);

    const ledger = await db.transaction.create({
      data: {
        walletId: updated.id,
        kind: TransactionKind.DEBIT,
        reason,
        amount,
        balanceAfter: updated.balance,
        refType: opts?.refType,
        refId: opts?.refId,
        description: opts?.description,
      },
    });
    return { wallet: updated, transaction: ledger };
  };

  return client ? run(client) : prisma.$transaction((tx) => run(tx));
}
