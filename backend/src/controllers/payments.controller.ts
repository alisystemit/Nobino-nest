/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R100 from "@/routes/api/pay__token";
import * as R101 from "@/routes/api/payments__callback__gateway";
import * as R102 from "@/routes/api/payments__create";
import * as R103 from "@/routes/api/payments__gateways";
import * as R104 from "@/routes/api/payments__mock-pay";

@Controller()
export class PaymentsController {

  @Get("/api/pay/:token")
  async getPayTokenRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R100.GET(r as never, c as never));
  }

  @Post("/api/pay/:token")
  async postPayTokenRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R100.POST(r as never, c as never));
  }

  @Get("/api/payments/callback/:gateway")
  async getPaymentsCallbackGatewayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R101.GET(r as never, c as never));
  }

  @Post("/api/payments/callback/:gateway")
  async postPaymentsCallbackGatewayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R101.POST(r as never, c as never));
  }

  @Post("/api/payments/create")
  async postPaymentsCreateRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R102.POST(r as never, c as never));
  }

  @Get("/api/payments/gateways")
  async getPaymentsGatewaysRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R103.GET(r as never, c as never));
  }

  @Get("/api/payments/mock-pay")
  async getPaymentsMockPayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R104.GET(r as never, c as never));
  }
}
