// خودکار: پورت‌شده از src/app/api/giftcards/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { json, apiError, getPagination } from "@/lib/utils";

const createSchema = z.object({
  balance: z.number().int().min(1000),
  salonId: z.string().optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

/** خرید/فروش کارت هدیه (کاربر واردشده) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = createSchema.parse(await req.json());

    const code = `GC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const card = await prisma.giftCard.create({
      data: {
        code,
        balance: body.balance,
        ownerId: user.id,
        salonId: body.salonId,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        isActive: true,
      },
    });

    return json({ success: true, card: { id: card.id, code: card.code, balance: card.balance } }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const { page, limit, skip, take } = getPagination(_req.url, 20, 100);
    const where = { ownerId: user.id };
    const [cards, total] = await Promise.all([
      prisma.giftCard.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      prisma.giftCard.count({ where }),
    ]);
    return json({ success: true, cards, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}

