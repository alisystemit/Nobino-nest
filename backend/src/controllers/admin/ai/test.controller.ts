import { Controller, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '@/common/guards/admin.guard';
import { AiLlmService } from '@/modules/ai/llm/llm.service';

@Controller('admin/ai/test')
@UseGuards(AdminGuard)
export class AiTestController {
  constructor(private readonly aiLlm: AiLlmService) {}

  @Post()
  async testConnection() {
    const result = await this.aiLlm.testConnection();
    if (!result.ok) {
      return {
        success: false,
        error: result.error ?? 'اتصال برقرار نشد',
        provider: result.provider,
        model: result.model,
      };
    }
    return {
      success: true,
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      sample: result.sample,
      message: `اتصال با «${result.provider}» (${result.model}) برقرار شد ✅`,
    };
  }
}
