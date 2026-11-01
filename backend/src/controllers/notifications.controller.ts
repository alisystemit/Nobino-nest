import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { requireRole } from '@/lib/auth/guards';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { json } from '@/lib/utils';

@Controller('api/v2/admin/notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  async list(@Query('status') status?: string, @Query('channel') channel?: string) {
    await requireRole(['ADMIN']);
    const notifications = await this.svc.list({ status, channel });
    return json({ success: true, notifications });
  }

  @Post()
  async retry(@Body() body: { id?: string }) {
    await requireRole(['ADMIN']);
    return json({ success: true, ...(await this.svc.retry(body?.id)) });
  }
}
