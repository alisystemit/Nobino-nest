import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { AiSuggestService } from '@/modules/ai/suggest/suggest.service';
import { RateLimitService } from '@/modules/rate-limit/rate-limit.service';

@Controller('salons/:slug/ai/suggest')
export class SalonsAiSuggestController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiSuggest: AiSuggestService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async suggest(@Param('slug') slug: string, @Body() body: { serviceId: string; date: string; employeeId?: string }) {
    const { serviceId, date, employeeId } = body;

    const rate = this.rateLimit.check('ai-suggest', 30, 60_000);
    if (!rate.ok) {
      return {
        success: false,
        error: `چند لحظه صبر کنید (${rate.retryAfterSec} ثانیه).`,
        retryAfterSec: rate.retryAfterSec,
      };
    }

    const salon = await this.prisma.salon.findUnique({ where: { slug } });
    if (!salon) return { success: false, error: 'سالن یافت نشد' };

    const result = await this.aiSuggest.suggestAlternatives({
      salonId: salon.id,
      serviceId,
      employeeId,
      dayISO: date,
    });
    return { success: true, ...result };
  }
}
