import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthController } from "@/controllers/auth.controller";
import { PublicController } from "@/controllers/public.controller";
import { SalonsController } from "@/controllers/salons.controller";
import { AppointmentsController } from "@/controllers/appointments.controller";
import { DashboardController } from "@/controllers/dashboard.controller";
import { AdminController } from "@/controllers/admin.controller";
import { PaymentsController } from "@/controllers/payments.controller";
import { FinanceController } from "@/controllers/finance.controller";
import { EngagementController } from "@/controllers/engagement.controller";
import { AiController } from "@/controllers/ai.controller";
import { CronController } from "@/controllers/cron.controller";
import { PagesController } from "@/controllers/pages.controller";
import { CronJobsService } from "@/cron/cron-jobs.service";

@Module({
  imports: [ScheduleModule.forRoot()],
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
    AiController,
    CronController,
    PagesController,
  ],
  providers: [CronJobsService],
})
export class AppModule {}
