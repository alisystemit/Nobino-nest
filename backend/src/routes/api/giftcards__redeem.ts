// خودکار: پورت‌شده از src/app/api/giftcards/redeem/route.ts — خرج کارت هدیه و واریز به کیف پول


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { credit } from "@/lib/financial/wallet";
import { TransactionReason } from "@prisma/client";
import { json, apiError } from "@/lib/utils";
import { checkRate, clientIpFromRequest, tooManyRequests } from "@/lib/rate-limit-lite";

const MAX_AMOUNT = 50_000_000;

const schema = z.object({
  code: z.string().trim().min(6).max(64),
  amount: z.number().int().positive().max(MAX_AMOUNT),
});

/**
 * مصرف کارت هدیه (C4):
 * - کاهش موجودی با شرط «موجودی کافی» داخل UPDATE تا دو درخواست هم‌زمان کارت را منفی نکنند
 * - معادل مبلغ به کیف پول مصرف‌کننده واریز می‌شود (قبلاً فقط کد می‌سوخت و چیزی پرداخت نمی‌شد)
 * - کسر و واریز در یک تراکنش، تا هیچ‌وقت پولی غیب یا خلق نشود
 */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ success: false, error: "کد یا مبلغ کارت هدیه معتبر نیست." }, { status: 400 });
    const body = parsed.data;

    // کد کارت‌ها حدس‌زدنی نباشد: هر IP و هر حساب سقف جدا دارد
    const ip = clientIpFromRequest(req);
    const perUser = checkRate(`giftcard-redeem:user:${user.id}`, 15, 60 * 60 * 1000);
    const perIp = checkRate(`giftcard-redeem:ip:${ip}`, 30, 60 * 60 * 1000);
    if (!perUser.ok || !perIp.ok) {
      return tooManyRequests(Math.max(perUser.retryAfterSec, perIp.retryAfterSec), "درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.");
    }

    const code = body.code.toUpperCase();
    const card = await prisma.giftCard.findUnique({ where: { code } });
    if (!card || !card.isActive) return json({ success: false, error: "کارت نامعتبر است." }, { status: 400 });
    if (card.expiresAt && card.expiresAt < new Date()) {
      return json({ success: false, error: "کارت منقضی شده است." }, { status: 400 });
    }
    if (card.balance < body.amount) {
      return json({ success: false, error: "موجودی کارت کافی نیست." }, { status: 400 });
    }
    if (card.ownerId === user.id) {
      return json({ success: false, error: "نمی‌توانید از کارت خودتان استفاده کنید." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      // شرط‌ها داخل same UPDATE: اگر لحظه‌ای کارت غیرفعال/منقضی/کم‌موجود شد، count صفر می‌شود
      const spent = await tx.giftCard.updateMany({
        where: {
          id: card.id,
          isActive: true,
          balance: { gte: body.amount },
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        data: { balance: { decrement: body.amount } },
      });
      if (spent.count !== 1) return null;

      const after = await tx.giftCard.findUnique({ where: { id: card.id } });
      const remaining = Math.max(0, after?.balance ?? 0);
      if (remaining === 0) {
        await tx.giftCard.update({ where: { id: card.id }, data: { isActive: false } });
      }

      const paid = await credit(
        user.id,
        body.amount,
        TransactionReason.ADMIN_ADJUSTMENT,
        { refType: "GiftCard", refId: card.id, description: `اعتبار کارت هدیه ${card.code}` },
        tx
      );

      return { remaining, wallet: paid.wallet, transaction: paid.transaction };
    });

    if (!result) {
      return json({ success: false, error: "موجودی کارت کافی نیست یا کارت هم‌زمان غیرفعال شده است." }, { status: 400 });
    }

    return json({
      success: true,
      remaining: result.remaining,
      amount: body.amount,
      wallet: result.wallet,
      transactionId: result.transaction.id,
    });
  } catch (err) {
    return apiError(err);
  }
}
