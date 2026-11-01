import { Controller, Get, Patch, Body, Query } from '@nestjs/common';
import { requireRole } from '@/lib/auth/guards';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { json } from '@/lib/utils';

@Controller('api/v2/admin/subscriptions')
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  @Get()
  async list(@Query('page') page?: string, @Query('limit') limit?: string) {
    await requireRole(['ADMIN']);
    const result = await this.svc.list({ page: Number(page) || 1, limit: Number(limit) || 50 });
    return json({ success: true, ...result });
  }

  @Patch()
  async setStatus(@Body() body: { subscriptionId: string; status: string }) {
    await requireRole(['ADMIN']);
    const subscription = await this.svc.setStatus(body.subscriptionId, body.status);
    return json({ success: true, subscription });
  }
}
