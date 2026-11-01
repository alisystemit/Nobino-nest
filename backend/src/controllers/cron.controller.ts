/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R41 from "@/routes/api/cron__holds";
import * as R42 from "@/routes/api/cron__notifications";
import * as R43 from "@/routes/api/cron__reminders";
import * as R44 from "@/routes/api/cron__subscriptions";
import * as R45 from "@/routes/api/cron__waitlist";

@Controller()
export class CronController {

  @Get("/api/cron/holds")
  async getCronHoldsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R41.GET(r as never, c as never));
  }

  @Get("/api/cron/notifications")
  async getCronNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R42.GET(r as never, c as never));
  }

  @Get("/api/cron/reminders")
  async getCronRemindersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R43.GET(r as never, c as never));
  }

  @Get("/api/cron/subscriptions")
  async getCronSubscriptionsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R44.GET(r as never, c as never));
  }

  @Get("/api/cron/waitlist")
  async getCronWaitlistRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R45.GET(r as never, c as never));
  }
}
