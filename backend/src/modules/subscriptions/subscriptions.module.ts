import { Module } from '@nestjs/common';
import { PrismaModule } from '@/common/database/prisma.module';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from '../../controllers/subscriptions.controller';

@Module({
  imports: [PrismaModule],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
  controllers: [SubscriptionsController],
})
export class SubscriptionsModule {}
