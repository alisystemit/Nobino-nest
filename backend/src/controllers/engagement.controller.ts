/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R0 from "@/routes/api/account__reviews";
import * as R85 from "@/routes/api/favorites";
import * as R86 from "@/routes/api/favorites__salonId";
import * as R96 from "@/routes/api/notifications";
import * as R115 from "@/routes/api/support";
import * as R116 from "@/routes/api/upload__avatar";

@Controller()
export class EngagementController {

  @Get("/api/account/reviews")
  async getAccountReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R0.GET(r as never, c as never));
  }

  @Get("/api/favorites")
  async getFavoritesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R85.GET(r as never, c as never));
  }

  @Post("/api/favorites/:salonId")
  async postFavoritesSalonIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R86.POST(r as never, c as never));
  }

  @Delete("/api/favorites/:salonId")
  async deleteFavoritesSalonIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R86.DELETE(r as never, c as never));
  }

  @Get("/api/notifications")
  async getNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R96.GET(r as never, c as never));
  }

  @Patch("/api/notifications")
  async patchNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R96.PATCH(r as never, c as never));
  }

  @Post("/api/support")
  async postSupportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R115.POST(r as never, c as never));
  }

  @Get("/api/support")
  async getSupportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R115.GET(r as never, c as never));
  }

  @Post("/api/upload/avatar")
  async postUploadAvatarRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R116.POST(r as never, c as never));
  }
}
