/**
 * بازگشت بیعانه‌ها در پنل سالن‌دار (O2).
 *
 * GET  → دو فهرست: «در انتظار بازگشت» (بیعانهٔ پرداخت‌شده روی نوبتِ لغو/غایب) و
 *         «بازگشت‌داده‌شده»؛ به‌همراه جمع کل برای کارت مالی.
 * POST → { paymentId, note? } = تأیید اینکه پول واقعاً به مشتری برگشته است؛
 *         همان‌جا با UPDATE مشروط به `status: "PAID"` یک‌بار ثبت می‌شود.
 */
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { json, apiError, assertKnownQueryParams, boolQueryParam } from "@/lib/utils";
import {
  depositRefundSummary,
  listDueDepositRefunds,
  listSettledDepositRefunds,
  settleDepositRefund,
} from "@/lib/financial/deposit-refund";

const FILTERS = ["settled"];
const settleSchema = z.object({
  paymentId: z.string().min(1),
  note: z.string().trim().max(200).optional(),
});

export async function GET(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const url = new URL(req.url);
    assertKnownQueryParams(url, FILTERS);
    const wantSettled = boolQueryParam(url, "settled", { label: "بازگشت‌شده‌ها" }) ?? false;
    const [due, settled, summary] = await Promise.all([
      wantSettled ? [] : listDueDepositRefunds(id),
      listSettledDepositRefunds(id),
      depositRefundSummary(id),
    ]);

    return json({ success: true, due, settled, summary, salonId: id });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSalonManage(id);
    const body = settleSchema.parse(await req.json());

    // مالیات/سهم پلتفرم از بیعانه کسر نمی‌شود؛ مبلغ دقیق همان ردیف Payment ملاک است
    const row = await settleDepositRefund({ paymentId: body.paymentId, salonId: id, byUserId: user.id, note: body.note });
    const summary = await depositRefundSummary(id);
    return json({ success: true, refunded: row, summary });
  } catch (err) {
    return apiError(err);
  }
}
