/**
 * رسیدگی سوپرادمین به یک درخواست تسویه: PROCESSING / PAID / REJECTED.
 * وجهٔ پولی: هنگام create موجودی بدهکار شده، پس فقط REJECTED موجودی را برمی‌گرداند (REFUND).
 * انتقال وضعیت اتمیک است (updateMany با شرط وضعیت قبلی) تا دو ادمین هم‌زمان
 * یک درخواست را دوباره refund نکنند.
 */
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { credit } from "@/lib/financial/wallet";
import { logAudit } from "@/lib/audit";
import { asNumber } from "@/lib/money";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ status: z.enum(["PROCESSING", "PAID", "REJECTED"]) });

/** ماشین وضعیت — از هر وضعیت نهایی (PAID/REJECTED) بازگشتی وجود ندارد */
const TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["PROCESSING", "PAID", "REJECTED"],
  PROCESSING: ["PAID", "REJECTED"],
  PAID: [],
  REJECTED: [],
};

export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await params;
    const { status } = schema.parse(await req.json());

    const payout = await prisma.payout.findUnique({
      where: { id },
      include: { wallet: { select: { id: true, ownerId: true, balance: true } } },
    });
    if (!payout) return json({ success: false, error: "درخواست تسویه یافت نشد" }, { status: 404 });

    const allowed = TRANSITIONS[payout.status] ?? [];
    if (!allowed.includes(status)) {
      return json({ success: false, error: `تغییر وضعیت از «${payout.status}» به «${status}» مجاز نیست` }, { status: 409 });
    }

    // قفل انتقال: فقط اگر وضعیت در لحظهٔ نوشتن هنوز همان بود، اعمال می‌شود
    const guarded = await prisma.payout.updateMany({
      where: { id, status: payout.status },
      data: { status, processedAt: new Date() },
    });
    if (guarded.count !== 1) {
      return json({ success: false, error: "وضعیت این درخواست همین حالا تغییر کرد؛ فهرست را تازه کنید" }, { status: 409 });
    }

    if (status === "REJECTED") {
      try {
        await credit(payout.wallet.ownerId, asNumber(payout.amount), "REFUND", {
          refType: "Payout",
          refId: payout.id,
          description: "بازگشت درخواست تسویه رد‌شده",
        });
      } catch (err) {
        // بازگرداندن وضعیت تا پول و ثبت هم‌خوان بمانند و ادمین دوباره تلاش کند
        await prisma.payout.update({ where: { id }, data: { status: payout.status, processedAt: null } });
        throw err;
      }
    }

    const updated = await prisma.payout.findUnique({ where: { id } });
    await logAudit({
      actorId: user.id,
      actorPhone: user.phone,
      action: "payout_update",
      entityType: "Payout",
      entityId: id,
      before: { status: payout.status },
      after: { status, amount: asNumber(payout.amount), refunded: status === "REJECTED" },
    });

    return json({ success: true, payout: updated, walletBalance: asNumber(payout.wallet.balance) + (status === "REJECTED" ? asNumber(payout.amount) : 0) });
  } catch (err) {
    return apiError(err);
  }
}
