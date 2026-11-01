/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R86 from "@/routes/api/pay__token";
import * as R87 from "@/routes/api/payments__callback__gateway";
import * as R88 from "@/routes/api/payments__create";
import * as R89 from "@/routes/api/payments__gateways";
import * as R90 from "@/routes/api/payments__mock-pay";

@Controller()
export class PaymentsController {

  @Get("/api/pay/:token")
  async getPayTokenRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R86.GET(r as never, c as never));
  }

  @Post("/api/pay/:token")
  async postPayTokenRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R86.POST(r as never, c as never));
  }

  @Get("/api/payments/callback/:gateway")
  async getPaymentsCallbackGatewayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R87.GET(r as never, c as never));
  }

  @Post("/api/payments/callback/:gateway")
  async postPaymentsCallbackGatewayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R87.POST(r as never, c as never));
  }

  @Post("/api/payments/create")
  async postPaymentsCreateRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R88.POST(r as never, c as never));
  }

  @Get("/api/payments/gateways")
  async getPaymentsGatewaysRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R89.GET(r as never, c as never));
  }

  @Get("/api/payments/mock-pay")
  async getPaymentsMockPayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R90.GET(r as never, c as never));
  }
}
