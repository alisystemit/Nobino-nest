import { Controller, Post, Body } from '@nestjs/common';
import { AuthUser, UserRole } from '@/common/decorators/auth-user.decorator';
import { AiLlmService } from '@/modules/ai/llm/llm.service';
import { PrismaService } from '@/common/database/prisma.service';

@Controller('ai/generate-content')
export class AiGenerateContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiLlm: AiLlmService,
  ) {}

  @Post()
  async generateContent(
    @AuthUser() user: { id: string; role: UserRole },
    @Body() body: { salonId: string; type: string; targetId?: string; name?: string; brief?: string },
  ) {
    const salon = await this.prisma.salon.findUnique({ where: { id: body.salonId } });
    if (!salon) return { success: false, error: 'سالن یافت نشد' };

    if (user.role !== 'ADMIN' && salon.ownerId !== user.id) {
      return { success: false, error: 'دسترسی غیرمجاز' };
    }

    if (body.targetId && body.targetId !== 'new') {
      if (body.type === 'service_description') {
        const svc = await this.prisma.service.findFirst({ where: { id: body.targetId, salonId: salon.id }, select: { id: true } });
        if (!svc) return { success: false, error: 'خدمت به این سالن تعلق ندارد' };
      }
      if (body.type === 'staff_bio') {
        const st = await this.prisma.staff.findFirst({ where: { id: body.targetId, salonId: salon.id }, select: { id: true } });
        if (!st) return { success: false, error: 'کارمند به این سالن تعلق ندارد' };
      }
    }

    const { text, usedAI } = await this.aiLlm.generateContent({
      type: body.type as any,
      salonId: body.salonId,
      targetId: body.targetId,
      name: body.name,
      brief: body.brief,
    });
    return { success: true, text, usedAI };
  }
}
