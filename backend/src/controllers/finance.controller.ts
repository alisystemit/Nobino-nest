/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R42 from "@/routes/api/commission";
import * as R89 from "@/routes/api/giftcards__redeem";
import * as R90 from "@/routes/api/giftcards";
import * as R92 from "@/routes/api/loyalty__redeem";
import * as R121 from "@/routes/api/wallet";

@Controller()
export class FinanceController {

  @Get("/api/commission")
  async getCommissionRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R42.GET(r as never, c as never));
  }

  @Post("/api/giftcards/redeem")
  async postGiftcardsRedeemRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R89.POST(r as never, c as never));
  }

  @Post("/api/giftcards")
  async postGiftcardsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R90.POST(r as never, c as never));
  }

  @Get("/api/giftcards")
  async getGiftcardsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R90.GET(r as never, c as never));
  }

  @Post("/api/loyalty/redeem")
  async postLoyaltyRedeemRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R92.POST(r as never, c as never));
  }

  @Get("/api/wallet")
  async getWalletRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R121.GET(r as never, c as never));
  }

  @Post("/api/wallet")
  async postWalletRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R121.POST(r as never, c as never));
  }
}
