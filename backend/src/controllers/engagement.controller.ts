/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R0 from "@/routes/api/account__reviews";
import * as R79 from "@/routes/api/favorites";
import * as R80 from "@/routes/api/favorites__salonId";
import * as R84 from "@/routes/api/notifications";
import * as R100 from "@/routes/api/support";
import * as R101 from "@/routes/api/upload__avatar";

@Controller()
export class EngagementController {

  @Get("/api/account/reviews")
  async getAccountReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R0.GET(r as never, c as never));
  }

  @Get("/api/favorites")
  async getFavoritesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R79.GET(r as never, c as never));
  }

  @Post("/api/favorites/:salonId")
  async postFavoritesSalonIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R80.POST(r as never, c as never));
  }

  @Delete("/api/favorites/:salonId")
  async deleteFavoritesSalonIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R80.DELETE(r as never, c as never));
  }

  @Get("/api/notifications")
  async getNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R84.GET(r as never, c as never));
  }

  @Patch("/api/notifications")
  async patchNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R84.PATCH(r as never, c as never));
  }

  @Post("/api/support")
  async postSupportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R100.POST(r as never, c as never));
  }

  @Get("/api/support")
  async getSupportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R100.GET(r as never, c as never));
  }

  @Post("/api/upload/avatar")
  async postUploadAvatarRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R101.POST(r as never, c as never));
  }
}
