import { Controller, Get, Post, Patch, Body, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '@/common/guards/admin.guard';
import { PrismaService } from '@/common/database/prisma.service';

@Controller('admin/subscriptions')
@UseGuards(AdminGuard)
export class AdminSubscriptionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getAll(@Query('limit') limit: string) {
    const take = Math.min(Number(limit ?? 300) || 300, 1000);

    const subscriptions = await this.prisma.subscription.findMany({
      include: {
        salon: {
          select: {
            id: true,
            name: true,
            slug: true,
            phone: true,
            city: true,
            plan: true,
            isApproved: true,
            isActive: true,
            subscriptionEndsAt: true,
            trialEndsAt: true,
            owner: { select: { name: true, phone: true } },
          },
        },
        package: {
          select: { id: true, name: true, plan: true, price: true, yearlyPrice: true, durationDays: true, isActive: true },
        },
        invoices: { select: { amount: true, status: true, paidAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    const now = Date.now();
    const rows = subscriptions.map((s) => {
      const paidInvoices = s.invoices.filter((i) => i.status === 'PAID' && i.paidAt);
      return {
        id: s.id,
        status: s.status,
        period: s.period,
        autoRenew: s.autoRenew,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        createdAt: s.createdAt,
        cancelledAt: s.cancelledAt,
        salonId: s.salonId,
        packageId: s.packageId,
        salon: s.salon
          ? {
              name: s.salon.name,
              slug: s.salon.slug,
              phone: s.salon.phone,
              city: s.salon.city,
              plan: s.salon.plan,
              isApproved: s.salon.isApproved,
              isActive: s.salon.isActive,
              subscriptionEndsAt: s.salon.subscriptionEndsAt,
              trialEndsAt: s.salon.trialEndsAt,
            }
          : null,
        ownerName: s.salon?.owner?.name ?? null,
        ownerPhone: s.salon?.owner?.phone ?? null,
        package: s.package
          ? {
              name: s.package.name,
              plan: s.package.plan,
              price: s.package.price,
              yearlyPrice: s.package.yearlyPrice,
              durationDays: s.package.durationDays,
              isActive: s.package.isActive,
            }
          : null,
        paidTotal: paidInvoices.reduce((sum, i) => sum + (i.amount || 0), 0),
        paidCount: paidInvoices.length,
        pastEnd: s.status === 'ACTIVE' && new Date(s.endsAt).getTime() < now,
      };
    });

    return { success: true, subscriptions: rows, returned: rows.length, truncated: rows.length >= take };
  }

  @Post()
  async updateStatus(@Body() body: { subscriptionId: string; action: string; days?: number; autoRenew?: boolean; note?: string }) {
    // متد فرضی - باید منطق اعمال اکشن پیاده شود
    return { success: true, message: 'Update logic not yet implemented' };
  }
}
