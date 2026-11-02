import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from '@/controllers/auth.controller';
import { PublicController } from '@/controllers/public.controller';
import { SalonsController } from '@/controllers/salons.controller';
import { AppointmentsController } from '@/controllers/appointments.controller';
import { DashboardController } from '@/controllers/dashboard.controller';
import { AdminController } from '@/controllers/admin.controller';
import { PaymentsController } from '@/controllers/payments.controller';
import { FinanceController } from '@/controllers/finance.controller';
import { EngagementController } from '@/controllers/engagement.controller';
import { CronController } from '@/controllers/cron.controller';
import { PagesController } from '@/controllers/pages.controller';
import { AiController } from '@/controllers/ai.controller';

import { AuthModule } from '@/modules/auth/auth.module';
import { SettingsModule } from '@/modules/settings/settings.module';
import { AiLlmModule } from '@/modules/ai/llm/llm.module';
import { AiAssistantModule } from '@/modules/ai/assistant/assistant.module';
import { AiParserModule } from '@/modules/ai/parser/parser.module';
import { AiSuggestModule } from '@/modules/ai/suggest/suggest.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { RateLimitModule } from '@/modules/rate-limit/rate-limit.module';
import { ReviewsModule } from '@/modules/reviews/reviews.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';

import { CronJobsService } from '@/cron/cron-jobs.service';

import { AiStatusController } from '@/controllers/admin/ai/status.controller';
import { AiTestController } from '@/controllers/admin/ai/test.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    SettingsModule,
    AiLlmModule,
    AiAssistantModule,
    AiParserModule,
    AiSuggestModule,
    AuditModule,
    RateLimitModule,
    ReviewsModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [
    AuthController,
    PublicController,
    SalonsController,
    AppointmentsController,
    DashboardController,
    AdminController,
    PaymentsController,
    FinanceController,
    EngagementController,
    CronController,
    PagesController,
    AiController,
    AiStatusController,
    AiTestController,
  ],
  providers: [CronJobsService],
})
export class AppModule {}
