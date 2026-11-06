/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R30 from "@/routes/api/appointments";
import * as R94 from "@/routes/api/health__db";
import * as R96 from "@/routes/api/mini__config";
import * as R97 from "@/routes/api/mini__session";
import * as R98 from "@/routes/api/mini__link";
import * as R99 from "@/routes/api/mini__staff";
import * as R100 from "@/routes/api/mini__featured";
import * as R102 from "@/routes/api/packages";
import * as R108 from "@/routes/api/public__announcement";
import * as R109 from "@/routes/api/public__upload_limits";
import * as R110 from "@/routes/api/pwa__manifest__slug";
import * as R111 from "@/routes/api/salons";
import * as R120 from "@/routes/api/sms__report";
import * as R125 from "@/routes/api/orders__id";

@Controller()
export class PublicController {

  @Get("/api/appointments")
  async getAppointmentsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R30.GET(r as never, c as never));
  }

  @Post("/api/appointments")
  async postAppointmentsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R30.POST(r as never, c as never));
  }

  @Get("/api/health/db")
  async getHealthDbRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R94.GET(r as never, c as never));
  }

  @Get("/api/mini/config")
  async getMiniConfigRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R96.GET(r as never, c as never));
  }

  @Post("/api/mini/session")
  async postMiniSessionRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R97.POST(r as never, c as never));
  }

  @Post("/api/mini/link")
  async postMiniLinkRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R98.POST(r as never, c as never));
  }

  @Get("/api/mini/staff")
  async getMiniStaffRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R99.GET(r as never, c as never));
  }

  @Get("/api/mini/featured")
  async getMiniFeaturedRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R100.GET(r as never, c as never));
  }

  @Get("/api/packages")
  async getPackagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R102.GET(r as never, c as never));
  }

  @Get("/api/public/announcement")
  async getPublicAnnouncementRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R108.GET(r as never, c as never));
  }

  @Get("/api/public/upload-limits")
  async getPublicUploadLimitsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R109.GET(r as never, c as never));
  }

  @Get("/api/pwa/manifest/:slug")
  async getPwaManifestSlugRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R110.GET(r as never, c as never));
  }

  @Get("/api/salons")
  async getSalonsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R111.GET(r as never, c as never));
  }

  @Post("/api/salons")
  async postSalonsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R111.POST(r as never, c as never));
  }

  @Get("/api/sms/report")
  async getSmsReportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R120.GET(r as never, c as never));
  }

  @Get("/api/orders/:id")
  async getOrdersIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R125.GET(r as never, c as never));
  }
}
