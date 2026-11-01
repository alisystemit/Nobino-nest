import { Controller, Get, Patch, Body } from '@nestjs/common';
import { requireRole } from '@/lib/auth/guards';
import { SubscriptionsService } from '@/modules/subscriptions/subscriptions.service';
import { json } from '@/lib/utils';

@Controller('api/v2/admin/subscriptions')
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  @Get()
  async list() {
    await requireRole(['ADMIN']);
    const subscriptions = await this.svc.list();
    return json({ success: true, subscriptions });
  }

  @Patch()
  async setStatus(@Body() body: { subscriptionId: string; status: string }) {
    await requireRole(['ADMIN']);
    const subscription = await this.svc.setStatus(body.subscriptionId, body.status);
    return json({ success: true, subscription });
  }
}
