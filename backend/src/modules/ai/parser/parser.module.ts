import { Module } from '@nestjs/common';
import { AiParserService } from './ai.parser.service';
import { PrismaModule } from '@/common/database/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AiParserService],
  exports: [AiParserService],
})
export class AiParserModule {}
