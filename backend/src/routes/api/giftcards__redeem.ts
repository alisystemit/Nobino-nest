// خودکار: پورت‌شده از src/app/api/giftcards/redeem/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ code: z.string(), amount: z.number().int().positive() });

/** مصرف کارت هدیه (کاهش موجودی) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = schema.parse(await req.json());

    const card = await prisma.giftCard.findUnique({ where: { code: body.code.trim().toUpperCase() } });
    if (!card || !card.isActive) return json({ success: false, error: "کارت نامعتبر است" }, { status: 400 });
    if (card.expiresAt && card.expiresAt < new Date()) {
      return json({ success: false, error: "کارت منقضی شده است" }, { status: 400 });
    }
    if (card.balance < body.amount) {
      return json({ success: false, error: "موجودی کارت کافی نیست" }, { status: 400 });
    }
    if (card.ownerId === user.id) {
      return json({ success: false, error: "نمی‌توانید از کارت خودتان استفاده کنید" }, { status: 400 });
    }

    const updated = await prisma.giftCard.update({
      where: { id: card.id },
      data: { balance: { decrement: body.amount } },
    });

    return json({ success: true, remaining: updated.balance });
  } catch (err) {
    return apiError(err);
  }
}

