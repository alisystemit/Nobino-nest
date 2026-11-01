import { Module } from '@nestjs/common';
import { AiAssistantService } from './assistant.service';
import { PrismaModule } from '@/common/database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
