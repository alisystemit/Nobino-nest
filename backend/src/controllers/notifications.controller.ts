import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { requireRole } from '@/lib/auth/guards';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { json } from '@/lib/utils';

@Controller('api/v2/admin/notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  async list(@Query('status') status?: string, @Query('channel') channel?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    await requireRole(['ADMIN']);
    const result = await this.svc.list({
      status,
      channel,
      page: Number(page) || 1,
      limit: Number(limit) || 50,
    });
    return json({ success: true, ...result });
  }

  @Post()
  async retry(@Body() body: { id?: string }) {
    await requireRole(['ADMIN']);
    return json({ success: true, ...(await this.svc.retry(body?.id)) });
  }
}
