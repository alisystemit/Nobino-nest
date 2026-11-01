import { Injectable } from '@nestjs/common';
import { prisma } from '@/lib/prisma';

@Injectable()
export class SubscriptionsService {
  async list(opts: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        include: {
          salon: { select: { name: true } },
          package: { select: { name: true, plan: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.subscription.count(),
    ]);
    return { subscriptions, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async setStatus(subscriptionId: string, status: string) {
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status },
    });
  }
}
