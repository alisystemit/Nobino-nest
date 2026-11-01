// گزارش کامل پیامک‌ها با تاریخ فارسی و وضعیت ارسال

import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    
    const { page, limit, skip, take } = getPagination(_req.url, 25, 200);
    const where = { channel: "SMS" as const };

    // دریافت پیامک‌های همین صفحه + آمار کلی از پایگاه داده (نه از صفحات دیده‌شده)
    const [notifications, total, byStatus] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
        select: {
          id: true,
          type: true,
          recipient: true,
          status: true,
          attempts: true,
          lastError: true,
          sentAt: true,
          createdAt: true,
          salonId: true,
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ]);

    // نام سالن (Notification رابطهٔ مستقیم با Salon ندارد؛ نگاشت دستی)
    const salonIds = Array.from(new Set(notifications.map((n) => n.salonId).filter(Boolean))) as string[];
    const salons = salonIds.length
      ? await prisma.salon.findMany({ where: { id: { in: salonIds } }, select: { id: true, name: true, slug: true } })
      : [];
    const salonMap = new Map(salons.map((s) => [s.id, s]));

    // تبدیل تاریخ به فارسی و ساخت فرمت کامل
    const reports = notifications.map((n) => {
      // تاریخ و زمان به فارسی
      const createdAt = new Date(n.createdAt);
      const createdAtFa = new Intl.DateTimeFormat("fa-IR", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Tehran",
      }).format(createdAt);

      let statusText = "";
      let statusColor = "";

      if (n.status === "SENT") {
        statusText = "ارسال شد";
        statusColor = "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
      } else if (n.status === "FAILED") {
        statusText = "خطا";
        statusColor = "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
      } else if (n.status === "DROPPED") {
        statusText = "رد شد";
        statusColor = "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
      } else {
        statusText = "در انتظار";
        statusColor = "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
      }

      return {
        id: n.id,
        phone: n.recipient,
        type: n.type,
        status: n.status,
        statusText: statusText,
        statusColor: statusColor,
        attempts: n.attempts,
        createdAt: createdAtFa,
        lastError: n.lastError || null,
        salon: n.salonId
          ? (() => {
              const s = salonMap.get(n.salonId);
              return s ? { id: s.id, name: s.name, slug: s.slug } : null;
            })()
          : null,
      };
    });

    // آمار کلی (روی همهٔ رکوردها، مستقل از صفحه)
    const countBy = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const stats = {
      total,
      sent: countBy("SENT"),
      failed: countBy("FAILED"),
      dropped: countBy("DROPPED"),
      pending: countBy("PENDING"),
    };

    return json({ success: true, reports, stats, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}
