/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R25 from "@/routes/api/appointments";
import * as R85 from "@/routes/api/packages";
import * as R91 from "@/routes/api/public__announcement";
import * as R92 from "@/routes/api/salons";

@Controller()
export class PublicController {

  @Get("/api/appointments")
  async getAppointmentsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R25.GET(r as never, c as never));
  }

  @Post("/api/appointments")
  async postAppointmentsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R25.POST(r as never, c as never));
  }

  @Get("/api/packages")
  async getPackagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R85.GET(r as never, c as never));
  }

  @Get("/api/public/announcement")
  async getPublicAnnouncementRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R91.GET(r as never, c as never));
  }

  @Get("/api/salons")
  async getSalonsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R92.GET(r as never, c as never));
  }

  @Post("/api/salons")
  async postSalonsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R92.POST(r as never, c as never));
  }
}
