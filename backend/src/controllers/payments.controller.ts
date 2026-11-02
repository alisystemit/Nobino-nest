/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R94 from "@/routes/api/pay__token";
import * as R95 from "@/routes/api/payments__callback__gateway";
import * as R96 from "@/routes/api/payments__create";
import * as R97 from "@/routes/api/payments__gateways";
import * as R98 from "@/routes/api/payments__mock-pay";

@Controller()
export class PaymentsController {

  @Get("/api/pay/:token")
  async getPayTokenRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R94.GET(r as never, c as never));
  }

  @Post("/api/pay/:token")
  async postPayTokenRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R94.POST(r as never, c as never));
  }

  @Get("/api/payments/callback/:gateway")
  async getPaymentsCallbackGatewayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R95.GET(r as never, c as never));
  }

  @Post("/api/payments/callback/:gateway")
  async postPaymentsCallbackGatewayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R95.POST(r as never, c as never));
  }

  @Post("/api/payments/create")
  async postPaymentsCreateRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R96.POST(r as never, c as never));
  }

  @Get("/api/payments/gateways")
  async getPaymentsGatewaysRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R97.GET(r as never, c as never));
  }

  @Get("/api/payments/mock-pay")
  async getPaymentsMockPayRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R98.GET(r as never, c as never));
  }
}
