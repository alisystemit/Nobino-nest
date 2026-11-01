import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminGuard } from '@/common/guards/admin.guard';
import { SettingsService } from '@/modules/settings/settings.service';
import { AiLlmService } from '@/modules/ai/llm/llm.service';

@Controller('admin/ai/status')
@UseGuards(AdminGuard)
export class AiStatusController {
  constructor(
    private readonly settings: SettingsService,
    private readonly aiLlm: AiLlmService,
  ) {}

  @Get()
  async getStatus() {
    const [providers, stt, active, enabled, switchOn] = await Promise.all([
      this.aiLlm.listProviders(),
      Promise.resolve([] as any[]),
      this.aiLlm.resolveActive(),
      this.settings.get('ai.provider'),
      this.aiLlm.switchOn(),
    ]);

    return {
      success: true,
      switchOn,
      provider: active?.provider ?? (providers.find((p: any) => p.keySet)?.id ?? null),
      preferredProvider: enabled ?? '',
      active: active ? { provider: active.provider, model: active.model, baseUrl: active.baseUrl } : null,
      llmProviders: providers,
      sttProviders: stt,
    };
  }
}
