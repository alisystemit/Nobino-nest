// خودکار: پورت‌شده از src/app/api/loyalty/redeem/route.ts — منطق تبدیل امتیاز به اعتبار


import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { credit } from "@/lib/financial/wallet";
import { TransactionReason } from "@prisma/client";
import { json, apiError } from "@/lib/utils";
import { checkRate, clientIpFromRequest, tooManyRequests } from "@/lib/rate-limit-lite";

// هر امتیاز وفاداری = ۱۰۰۰ تومان اعتبار کیف پول
const POINTS_VALUE = 1000;

const schema = z.object({ points: z.number().int().min(10).max(1_000_000) });

/** تبدیل امتیاز وفاداری به اعتبار کیف پول (اتمیک؛ دو کلیک هم‌زمان یک امتیاز را دوبار خرج نمی‌کند) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ success: false, error: "مقدار امتیاز معتبر نیست (حداقل ۱۰ امتیاز)." }, { status: 400 });
    }
    const { points } = parsed.data;

    // جلوگیری از تلاش مکرر برای تبدیل (و حدس زدن آستانه‌ها)
    const ip = clientIpFromRequest(req);
    const perUser = checkRate(`loyalty-redeem:user:${user.id}`, 10, 60 * 60 * 1000);
    const perIp = checkRate(`loyalty-redeem:ip:${ip}`, 30, 60 * 60 * 1000);
    if (!perUser.ok || !perIp.ok) {
      return tooManyRequests(Math.max(perUser.retryAfterSec, perIp.retryAfterSec), "درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.");
    }

    if (user.loyaltyPoints < points) {
      return json({ success: false, error: "امتیاز وفاداری شما کافی نیست." }, { status: 400 });
    }

    const amount = points * POINTS_VALUE;

    // کسر امتیاز و واریز اعتبار در یک تراکنش؛ شرط کافی بودن امتیاز داخل UPDATE
    // می‌نشیند تا دو درخواست هم‌زمان موجودی را منفی نکنند (TOCTOU).
    const result = await prisma.$transaction(async (tx) => {
      const spent = await tx.user.updateMany({
        where: { id: user.id, loyaltyPoints: { gte: points } },
        data: { loyaltyPoints: { decrement: points } },
      });
      if (spent.count !== 1) return null;

      const walletCredit = await credit(user.id, amount, TransactionReason.ADMIN_ADJUSTMENT, {
        refType: "LoyaltyRedeem",
        refId: user.id,
        description: `تبدیل ${points} امتیاز وفاداری به اعتبار`,
      }, tx);

      const fresh = await tx.user.findUnique({ where: { id: user.id }, select: { loyaltyPoints: true } });
      return { wallet: walletCredit.wallet, transaction: walletCredit.transaction, remaining: fresh?.loyaltyPoints ?? user.loyaltyPoints - points };
    });

    if (!result) {
      return json({ success: false, error: "امتیاز وفاداری شما کافی نیست." }, { status: 400 });
    }

    return json({
      success: true,
      points: result.remaining,
      amount,
      wallet: result.wallet,
      transactionId: result.transaction.id,
    });
  } catch (err) {
    return apiError(err);
  }
}
