import { Injectable } from '@nestjs/common';
import { prisma } from '@/lib/prisma';

@Injectable()
export class SubscriptionsService {
  async list() {
    return prisma.subscription.findMany({
      include: {
        salon: { select: { name: true } },
        package: { select: { name: true, plan: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async setStatus(subscriptionId: string, status: string) {
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status },
    });
  }
}
