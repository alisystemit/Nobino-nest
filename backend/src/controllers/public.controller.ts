/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R25 from "@/routes/api/appointments";
import * as R87 from "@/routes/api/mini__config";
import * as R88 from "@/routes/api/mini__session";
import * as R89 from "@/routes/api/mini__link";
import * as R90 from "@/routes/api/mini__staff";
import * as R91 from "@/routes/api/mini__featured";
import * as R93 from "@/routes/api/packages";
import * as R99 from "@/routes/api/public__announcement";
import * as R100 from "@/routes/api/pwa__manifest__slug";
import * as R101 from "@/routes/api/salons";

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

  @Get("/api/mini/config")
  async getMiniConfigRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R87.GET(r as never, c as never));
  }

  @Post("/api/mini/session")
  async postMiniSessionRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R88.POST(r as never, c as never));
  }

  @Post("/api/mini/link")
  async postMiniLinkRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R89.POST(r as never, c as never));
  }

  @Get("/api/mini/staff")
  async getMiniStaffRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R90.GET(r as never, c as never));
  }

  @Get("/api/mini/featured")
  async getMiniFeaturedRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R91.GET(r as never, c as never));
  }

  @Get("/api/packages")
  async getPackagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R93.GET(r as never, c as never));
  }

  @Get("/api/public/announcement")
  async getPublicAnnouncementRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R99.GET(r as never, c as never));
  }

  @Get("/api/pwa/manifest/:slug")
  async getPwaManifestSlugRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R100.GET(r as never, c as never));
  }

  @Get("/api/salons")
  async getSalonsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R101.GET(r as never, c as never));
  }

  @Post("/api/salons")
  async postSalonsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R101.POST(r as never, c as never));
  }
}
