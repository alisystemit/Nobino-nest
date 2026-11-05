// خودکار: پورت‌شده از src/app/api/giftcards/route.ts — خرید کارت هدیه از محل موجودی کیف پول


import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { debit } from "@/lib/financial/wallet";
import { TransactionReason } from "@prisma/client";
import { json, apiError, getPagination, formatToman } from "@/lib/utils";
import { checkRate, clientIpFromRequest, tooManyRequests } from "@/lib/rate-limit-lite";

// سقف‌ها: از «خلق پول» و کارت‌های بی‌شمار جلوگیری می‌کند
const MIN_CARD_BALANCE = 1_000;
const MAX_CARD_BALANCE = 50_000_000;
const MAX_ACTIVE_CARDS_PER_OWNER = 20;

const createSchema = z.object({
  balance: z.number().int().min(MIN_CARD_BALANCE).max(MAX_CARD_BALANCE),
  salonId: z.string().max(64).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

/** کد تصادفی و غیرقابل حدس (کد قبلی از زمان و ۴ رقم ساخته می‌شد) */
function newCardCode() {
  return `GC-${randomBytes(8).toString("hex").toUpperCase()}`;
}

/** خرید کارت هدیه؛ مبلغ از کیف پول خریدار کم می‌شود وگرنه خلق پول است (C4) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json(
        { success: false, error: `مبلغ کارت هدیه باید عددی صحیح بین ${formatToman(MIN_CARD_BALANCE)} و ${formatToman(MAX_CARD_BALANCE)} باشد.` },
        { status: 400 }
      );
    }
    const body = parsed.data;

    const ip = clientIpFromRequest(req);
    const perUser = checkRate(`giftcard-create:user:${user.id}`, 10, 60 * 60 * 1000);
    const perIp = checkRate(`giftcard-create:ip:${ip}`, 20, 60 * 60 * 1000);
    if (!perUser.ok || !perIp.ok) {
      return tooManyRequests(Math.max(perUser.retryAfterSec, perIp.retryAfterSec), "درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.");
    }

    if (body.salonId) {
      const salon = await prisma.salon.findUnique({ where: { id: body.salonId }, select: { id: true } });
      if (!salon) return json({ success: false, error: "سالن انتخابی معتبر نیست." }, { status: 400 });
    }

    const activeCards = await prisma.giftCard.count({ where: { ownerId: user.id, isActive: true } });
    if (activeCards >= MAX_ACTIVE_CARDS_PER_OWNER) {
      return json({ success: false, error: `به سقف ${MAX_ACTIVE_CARDS_PER_OWNER} کارت فعال خود رسیدید. لطفاً اول از کارت‌های قبلی استفاده کنید.` }, { status: 400 });
    }

    const code = newCardCode();

    // ساخت کارت و برداشت از کیف پول در یک تراکنش: موجودی ناکافی ⇒ هیچ کارتی نمی‌ماند
    const card = await prisma.$transaction(async (tx) => {
      const created = await tx.giftCard.create({
        data: {
          code,
          balance: body.balance,
          ownerId: user.id,
          salonId: body.salonId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          isActive: true,
        },
      });
      await debit(
        user.id,
        body.balance,
        TransactionReason.ADMIN_ADJUSTMENT,
        { refType: "GiftCard", refId: created.id, description: `خرید کارت هدیه ${code}` },
        tx
      );
      return created;
    });

    return json({ success: true, card: { id: card.id, code: card.code, balance: card.balance, expiresAt: card.expiresAt } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "موجودی کیف پول کافی نیست") {
      return json({ success: false, error: "موجودی کیف پول شما برای خرید این کارت کافی نیست." }, { status: 400 });
    }
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
