import { Injectable } from '@nestjs/common';
import { prisma } from '@/lib/prisma';
import { processPendingNotifications } from '@/lib/notifications/queue';

@Injectable()
export class NotificationsService {
  async list(opts: { status?: string; channel?: string; take?: number; page?: number; limit?: number }) {
    const where: Record<string, unknown> = {};
    if (opts.status) where.status = opts.status;
    if (opts.channel) where.channel = opts.channel;

    // صفحه‌بندی: page/limit از فراخوان می‌آید؛ take فقط سقف سازگار با گذشته است
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? opts.take ?? 50));
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip,
        take: limit,
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
    ]);

    const salonIds = Array.from(new Set(notifications.map((n) => n.salonId).filter(Boolean))) as string[];
    const salons = salonIds.length
      ? await prisma.salon.findMany({ where: { id: { in: salonIds } }, select: { id: true, name: true } })
      : [];
    const salonMap = new Map(salons.map((s) => [s.id, s.name]));

    return {
      notifications: notifications.map((n) => ({
        ...n,
        salonName: n.salonId ? (salonMap.get(n.salonId) ?? null) : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async retry(id?: string) {
    const where: Record<string, unknown> = id
      ? { id, status: { in: ['FAILED', 'DROPPED'] } }
      : { status: { in: ['FAILED', 'DROPPED'] } };
    const reset = await prisma.notification.updateMany({
      where,
      data: { status: 'PENDING', attempts: 0, lastError: null, nextAttemptAt: new Date() },
    });
    const result = await processPendingNotifications(25).catch(() => ({ processed: 0, sent: 0, failed: 0 }));
    return { reset: reset.count, ...result };
  }
}
