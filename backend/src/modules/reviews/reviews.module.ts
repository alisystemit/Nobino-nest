import { Module } from '@nestjs/common';
import { PrismaModule } from '@/common/database/prisma.module';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from '../../controllers/reviews.controller';

@Module({
  imports: [PrismaModule],
  providers: [ReviewsService],
  exports: [ReviewsService],
  controllers: [ReviewsController],
})
export class ReviewsModule {}
