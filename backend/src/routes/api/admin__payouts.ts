/**
 * فهرست درخواست‌های تسویه (Payout) برای سوپرادمین — صفحه‌بندی سمت سرور.
 * قرارداد پاسخ: { payouts, total, page, limit, totalPages, pendingTotal }
 */
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination } from "@/lib/utils";

const STATUSES = new Set(["REQUESTED", "PROCESSING", "PAID", "REJECTED"]);

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const raw = (url.searchParams.get("status") || "").toUpperCase();
    const status = STATUSES.has(raw) ? raw : null;
    const { page, limit, skip, take } = getPagination(req.url, 25, 200);
    const where = status ? { status: status as never } : {};

    const [payouts, total, pendingAgg] = await Promise.all([
      prisma.payout.findMany({
        where,
        include: {
          wallet: { select: { balance: true, owner: { select: { id: true, name: true, phone: true } } } },
        },
        orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.payout.count({ where }),
      prisma.payout.aggregate({ where: { status: "REQUESTED" }, _sum: { amount: true }, _count: true }),
    ]);

    return json({
      success: true,
      payouts: payouts.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        bankInfo: p.bankInfo,
        status: p.status,
        requestedAt: p.requestedAt,
        processedAt: p.processedAt,
        walletBalance: p.wallet.balance,
        owner: p.wallet.owner,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      pendingTotal: pendingAgg._sum.amount ?? 0,
      pendingCount: pendingAgg._count,
    });
  } catch (err) {
    return apiError(err);
  }
}
