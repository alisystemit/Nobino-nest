/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R107 from "@/routes/api/salons__search";
import * as R108 from "@/routes/api/salons__slug__ai__suggest";
import * as R109 from "@/routes/api/salons__slug__availability";
import * as R110 from "@/routes/api/salons__slug__reviews";
import * as R111 from "@/routes/api/salons__slug";
import * as R112 from "@/routes/api/salons__slug__waitlist";
import * as R113 from "@/routes/api/salons__slug__waitlist__id";
import * as R114 from "@/routes/api/salons__slug__banner";

@Controller()
export class SalonsController {

  @Get("/api/salons/search")
  async getSalonsSearchRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R107.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/ai/suggest")
  async postSalonsSlugAiSuggestRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R108.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug/availability")
  async getSalonsSlugAvailabilityRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R109.GET(r as never, c as never));
  }

  @Get("/api/salons/:slug/reviews")
  async getSalonsSlugReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R110.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/reviews")
  async postSalonsSlugReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R110.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug")
  async getSalonsSlugRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R111.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/waitlist")
  async postSalonsSlugWaitlistRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R112.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug/waitlist")
  async getSalonsSlugWaitlistRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R112.GET(r as never, c as never));
  }

  @Patch("/api/salons/:slug/waitlist/:id")
  async patchSalonsSlugWaitlistIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R113.PATCH(r as never, c as never));
  }

  @Get("/api/salons/:slug/banner.svg")
  async getSalonsSlugBannerSvgRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R114.GET(r as never, c as never));
  }
}
