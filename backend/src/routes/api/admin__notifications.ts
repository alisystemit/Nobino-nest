// خودکار: پورت‌شده از src/app/api/admin/notifications/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { processPendingNotifications } from "@/lib/notifications/queue";
import { getSetting } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { json, apiError, getPagination, enumQueryParam } from "@/lib/utils";

const NOTIFY_STATUS = ["PENDING", "SENT", "FAILED", "DROPPED"] as const;
const NOTIFY_CHANNEL = ["SMS", "IN_APP", "EMAIL"] as const;

/** گزارش ارسال پیامک/ایمیل: وضعیت، خطاها، تلاش مجدد و هزینه تخمینی */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const status = enumQueryParam(url, "status", NOTIFY_STATUS, { label: "وضعیت ارسال" });
    const channel = enumQueryParam(url, "channel", NOTIFY_CHANNEL, { label: "کانال" });
    const { page, limit, skip, take } = getPagination(req.url, 25, 200);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (channel) where.channel = channel;

    const [notifications, total, statusGroups, channelGroups, sentSms] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
        select: {
          id: true,
          type: true,
          channel: true,
          recipient: true,
          status: true,
          attempts: true,
          lastError: true,
          nextAttemptAt: true,
          sentAt: true,
          createdAt: true,
          salonId: true,
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.notification.groupBy({ by: ["channel"], _count: { _all: true } }),
      prisma.notification.count({ where: { channel: "SMS", status: "SENT" } }),
    ]);

    // نام سالن برای هر اعلان (Notification رابطهٔ مستقیم با Salon ندارد؛ نگاشت دستی)
    const salonIds = Array.from(new Set(notifications.map((n) => n.salonId).filter(Boolean))) as string[];
    const salons = salonIds.length
      ? await prisma.salon.findMany({ where: { id: { in: salonIds } }, select: { id: true, name: true } })
      : [];
    const salonNameMap = new Map(salons.map((s) => [s.id, s.name]));
    const enriched = notifications.map((n) => ({
      ...n,
      salonName: n.salonId ? (salonNameMap.get(n.salonId) ?? null) : null,
    }));

    const statusSummary = { PENDING: 0, SENT: 0, FAILED: 0, DROPPED: 0 } as Record<string, number>;
    for (const g of statusGroups) statusSummary[g.status] = g._count._all;
    const channelSummary: Record<string, number> = {};
    for (const g of channelGroups) channelSummary[g.channel] = g._count._all;

    const unitCost = Number((await getSetting("sms.cost_per_message")) ?? 0);

    return json({
      success: true,
      notifications: enriched,
      total,
      page,
      limit,
      summary: {
        ...statusSummary,
        channels: channelSummary,
        estimatedCost: Number.isFinite(unitCost) ? sentSms * unitCost : 0,
        unitCost: Number.isFinite(unitCost) ? unitCost : 0,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

const retrySchema = z.object({ id: z.string().optional() });

/** تلاش مجدد برای اعلان‌های ناموفق (یک مورد یا همه) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const admin = await requireRole(["ADMIN"]);
    const body = retrySchema.parse(await req.json().catch(() => ({})));

    const where = body.id
      ? { id: body.id, status: { in: ["FAILED", "DROPPED"] } }
      : { status: { in: ["FAILED", "DROPPED"] } };

    const reset = await prisma.notification.updateMany({
      where,
      data: { status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: new Date() },
    });

    const result = await processPendingNotifications(25).catch(() => ({ processed: 0, sent: 0, failed: 0 }));

    await logAudit({
      actorId: admin.id,
      actorPhone: admin.phone,
      action: "notification_retry",
      entityType: "Notification",
      entityId: body.id ?? undefined,
      after: { reset: reset.count, ...result },
    });

    return json({ success: true, reset: reset.count, ...result });
  } catch (err) {
    return apiError(err);
  }
}

