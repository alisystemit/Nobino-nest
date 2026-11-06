/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R46 from "@/routes/api/cron__holds";
import * as R47 from "@/routes/api/cron__notifications";
import * as R48 from "@/routes/api/cron__reminders";
import * as R49 from "@/routes/api/cron__subscriptions";
import * as R50 from "@/routes/api/cron__waitlist";

@Controller()
export class CronController {

  @Get("/api/cron/holds")
  async getCronHoldsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R46.GET(r as never, c as never));
  }

  @Get("/api/cron/notifications")
  async getCronNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R47.GET(r as never, c as never));
  }

  @Get("/api/cron/reminders")
  async getCronRemindersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R48.GET(r as never, c as never));
  }

  @Get("/api/cron/subscriptions")
  async getCronSubscriptionsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R49.GET(r as never, c as never));
  }

  @Get("/api/cron/waitlist")
  async getCronWaitlistRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R50.GET(r as never, c as never));
  }
}
