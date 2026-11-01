import { Module, Global } from '@nestjs/common';
import { AiSuggestService } from './suggest.service';

@Global()
@Module({
  providers: [AiSuggestService],
  exports: [AiSuggestService],
})
export class AiSuggestModule {}
