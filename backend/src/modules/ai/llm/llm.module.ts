import { Module, Global } from '@nestjs/common';
import { AiLlmService } from './llm.service';
import { PrismaModule } from '@/common/database/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AiLlmService],
  exports: [AiLlmService],
})
export class AiLlmModule {}
