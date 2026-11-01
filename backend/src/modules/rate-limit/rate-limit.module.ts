import { Module } from '@nestjs/common';
import { RateLimitMiddlewareService } from './rate-limit.service';

@Module({
  providers: [RateLimitMiddlewareService],
  exports: [RateLimitMiddlewareService],
})
export class RateLimitModule {}
