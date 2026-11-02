/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R27 from "@/routes/api/appointments";
import * as R89 from "@/routes/api/health__db";
import * as R91 from "@/routes/api/mini__config";
import * as R92 from "@/routes/api/mini__session";
import * as R93 from "@/routes/api/mini__link";
import * as R94 from "@/routes/api/mini__staff";
import * as R95 from "@/routes/api/mini__featured";
import * as R97 from "@/routes/api/packages";
import * as R103 from "@/routes/api/public__announcement";
import * as R104 from "@/routes/api/public__upload_limits";
import * as R105 from "@/routes/api/pwa__manifest__slug";
import * as R106 from "@/routes/api/salons";
import * as R115 from "@/routes/api/sms__report";

@Controller()
export class PublicController {

  @Get("/api/appointments")
  async getAppointmentsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R27.GET(r as never, c as never));
  }

  @Post("/api/appointments")
  async postAppointmentsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R27.POST(r as never, c as never));
  }

  @Get("/api/health/db")
  async getHealthDbRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R89.GET(r as never, c as never));
  }

  @Get("/api/mini/config")
  async getMiniConfigRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R91.GET(r as never, c as never));
  }

  @Post("/api/mini/session")
  async postMiniSessionRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R92.POST(r as never, c as never));
  }

  @Post("/api/mini/link")
  async postMiniLinkRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R93.POST(r as never, c as never));
  }

  @Get("/api/mini/staff")
  async getMiniStaffRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R94.GET(r as never, c as never));
  }

  @Get("/api/mini/featured")
  async getMiniFeaturedRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R95.GET(r as never, c as never));
  }

  @Get("/api/packages")
  async getPackagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R97.GET(r as never, c as never));
  }

  @Get("/api/public/announcement")
  async getPublicAnnouncementRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R103.GET(r as never, c as never));
  }

  @Get("/api/public/upload-limits")
  async getPublicUploadLimitsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R104.GET(r as never, c as never));
  }

  @Get("/api/pwa/manifest/:slug")
  async getPwaManifestSlugRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R105.GET(r as never, c as never));
  }

  @Get("/api/salons")
  async getSalonsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R106.GET(r as never, c as never));
  }

  @Post("/api/salons")
  async postSalonsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R106.POST(r as never, c as never));
  }

  @Get("/api/sms/report")
  async getSmsReportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R115.GET(r as never, c as never));
  }
}
