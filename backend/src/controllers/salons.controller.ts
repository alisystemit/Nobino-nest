/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R98 from "@/routes/api/salons__search";
import * as R99 from "@/routes/api/salons__slug__ai__suggest";
import * as R100 from "@/routes/api/salons__slug__availability";
import * as R101 from "@/routes/api/salons__slug__reviews";
import * as R102 from "@/routes/api/salons__slug";
import * as R103 from "@/routes/api/salons__slug__waitlist";
import * as R104 from "@/routes/api/salons__slug__waitlist__id";
import * as R105 from "@/routes/api/salons__slug__banner";

@Controller()
export class SalonsController {

  @Get("/api/salons/search")
  async getSalonsSearchRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R98.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/ai/suggest")
  async postSalonsSlugAiSuggestRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R99.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug/availability")
  async getSalonsSlugAvailabilityRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R100.GET(r as never, c as never));
  }

  @Get("/api/salons/:slug/reviews")
  async getSalonsSlugReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R101.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/reviews")
  async postSalonsSlugReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R101.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug")
  async getSalonsSlugRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R102.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/waitlist")
  async postSalonsSlugWaitlistRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R103.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug/waitlist")
  async getSalonsSlugWaitlistRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R103.GET(r as never, c as never));
  }

  @Patch("/api/salons/:slug/waitlist/:id")
  async patchSalonsSlugWaitlistIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R104.PATCH(r as never, c as never));
  }

  @Get("/api/salons/:slug/banner.svg")
  async getSalonsSlugBannerRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R105.GET(r as never, c as never));
  }
}
