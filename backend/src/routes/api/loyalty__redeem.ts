// خودکار: پورت‌شده از src/app/api/loyalty/redeem/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { credit } from "@/lib/financial/wallet";
import { TransactionReason } from "@prisma/client";
import { json, apiError } from "@/lib/utils";

// هر امتیاز وفاداری = ۱۰۰۰ تومان اعتبار کیف پول
const POINTS_VALUE = 1000;

const schema = z.object({ points: z.number().int().min(10) });

/** تبدیل امتیاز وفاداری به اعتبار کیف پول */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const { points } = schema.parse(await req.json());

    if (user.loyaltyPoints < points) {
      return json({ success: false, error: "insufficient loyalty points" }, { status: 400 });
    }

    const amount = points * POINTS_VALUE;

    await prisma.user.update({
      where: { id: user.id },
      data: { loyaltyPoints: { decrement: points } },
    });

    const walletCredit = await credit(user.id, amount, TransactionReason.ADMIN_ADJUSTMENT, {
      description: `تبدیل ${points} امتیاز وفاداری به اعتبار`,
    });

    return json({ success: true, points: user.loyaltyPoints - points, amount, wallet: walletCredit.wallet });
  } catch (err) {
    return apiError(err);
  }
}
