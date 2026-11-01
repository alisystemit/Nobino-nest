import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { AiAssistantService } from '@/modules/ai/assistant/assistant.service';
import { RateLimitService } from '@/modules/rate-limit/rate-limit.service';

@Controller('ai/chat')
export class AiChatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiAssistant: AiAssistantService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async chat(@Body() body: { salonId: string; question: string; customerName?: string; history?: { role: 'user' | 'assistant'; content: string }[] }) {
    const { salonId, question, customerName, history } = body;

    const rate = this.rateLimit.check('ai-chat', 15, 60_000);
    if (!rate.ok) {
      return {
        success: false,
        error: `برای جلوگیری از سوءاستفاده، چند لحظه صبر کنید (${rate.retryAfterSec} ثانیه).`,
        retryAfterSec: rate.retryAfterSec,
      };
    }

    const salon = await this.prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) return { success: false, error: 'سالن یافت نشد' };

    const { reply, usedAI } = await this.aiAssistant.reply(question, {
      salonId,
      customerName,
      history,
    });
    return { success: true, reply, usedAI };
  }
}
