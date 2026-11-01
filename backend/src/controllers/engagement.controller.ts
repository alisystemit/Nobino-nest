/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R0 from "@/routes/api/account__reviews";
import * as R82 from "@/routes/api/favorites";
import * as R83 from "@/routes/api/favorites__salonId";
import * as R88 from "@/routes/api/notifications";
import * as R105 from "@/routes/api/support";
import * as R106 from "@/routes/api/upload__avatar";

@Controller()
export class EngagementController {

  @Get("/api/account/reviews")
  async getAccountReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R0.GET(r as never, c as never));
  }

  @Get("/api/favorites")
  async getFavoritesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R82.GET(r as never, c as never));
  }

  @Post("/api/favorites/:salonId")
  async postFavoritesSalonIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R83.POST(r as never, c as never));
  }

  @Delete("/api/favorites/:salonId")
  async deleteFavoritesSalonIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R83.DELETE(r as never, c as never));
  }

  @Get("/api/notifications")
  async getNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R88.GET(r as never, c as never));
  }

  @Patch("/api/notifications")
  async patchNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R88.PATCH(r as never, c as never));
  }

  @Post("/api/support")
  async postSupportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R105.POST(r as never, c as never));
  }

  @Get("/api/support")
  async getSupportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R105.GET(r as never, c as never));
  }

  @Post("/api/upload/avatar")
  async postUploadAvatarRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R106.POST(r as never, c as never));
  }
}
