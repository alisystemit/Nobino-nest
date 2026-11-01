/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R93 from "@/routes/api/salons__search";
import * as R94 from "@/routes/api/salons__slug__ai__suggest";
import * as R95 from "@/routes/api/salons__slug__availability";
import * as R96 from "@/routes/api/salons__slug__reviews";
import * as R97 from "@/routes/api/salons__slug";
import * as R98 from "@/routes/api/salons__slug__waitlist";
import * as R99 from "@/routes/api/salons__slug__waitlist__id";

@Controller()
export class SalonsController {

  @Get("/api/salons/search")
  async getSalonsSearchRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R93.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/ai/suggest")
  async postSalonsSlugAiSuggestRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R94.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug/availability")
  async getSalonsSlugAvailabilityRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R95.GET(r as never, c as never));
  }

  @Get("/api/salons/:slug/reviews")
  async getSalonsSlugReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R96.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/reviews")
  async postSalonsSlugReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R96.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug")
  async getSalonsSlugRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R97.GET(r as never, c as never));
  }

  @Post("/api/salons/:slug/waitlist")
  async postSalonsSlugWaitlistRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R98.POST(r as never, c as never));
  }

  @Get("/api/salons/:slug/waitlist")
  async getSalonsSlugWaitlistRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R98.GET(r as never, c as never));
  }

  @Patch("/api/salons/:slug/waitlist/:id")
  async patchSalonsSlugWaitlistIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R99.PATCH(r as never, c as never));
  }
}
