import { Module } from '@nestjs/common';
import { PrismaModule } from '@/common/database/prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from '../../controllers/notifications.controller';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
