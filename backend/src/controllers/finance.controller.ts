/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R40 from "@/routes/api/commission";
import * as R81 from "@/routes/api/giftcards__redeem";
import * as R82 from "@/routes/api/giftcards";
import * as R83 from "@/routes/api/loyalty__redeem";
import * as R103 from "@/routes/api/wallet";

@Controller()
export class FinanceController {

  @Get("/api/commission")
  async getCommissionRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R40.GET(r as never, c as never));
  }

  @Post("/api/giftcards/redeem")
  async postGiftcardsRedeemRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R81.POST(r as never, c as never));
  }

  @Post("/api/giftcards")
  async postGiftcardsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R82.POST(r as never, c as never));
  }

  @Get("/api/giftcards")
  async getGiftcardsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R82.GET(r as never, c as never));
  }

  @Post("/api/loyalty/redeem")
  async postLoyaltyRedeemRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R83.POST(r as never, c as never));
  }

  @Get("/api/wallet")
  async getWalletRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R103.GET(r as never, c as never));
  }

  @Post("/api/wallet")
  async postWalletRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R103.POST(r as never, c as never));
  }
}
