/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R1 from "@/routes/api/admin__audit";
import * as R2 from "@/routes/api/admin__auth__login";
import * as R3 from "@/routes/api/admin__broadcast";
import * as R4 from "@/routes/api/admin__charts";
import * as R5 from "@/routes/api/admin__discounts";
import * as R6 from "@/routes/api/admin__discounts__id";
import * as R7 from "@/routes/api/admin__invoices";
import * as R8 from "@/routes/api/admin__limits";
import * as R9 from "@/routes/api/admin__notifications";
import * as R10 from "@/routes/api/admin__packages";
import * as R11 from "@/routes/api/admin__reviews";
import * as R12 from "@/routes/api/admin__saas-metrics";
import * as R13 from "@/routes/api/admin__salons__id";
import * as R14 from "@/routes/api/admin__salons__id__status";
import * as R15 from "@/routes/api/admin__settings";
import * as R16 from "@/routes/api/admin__sms__test";
import * as R17 from "@/routes/api/admin__subscriptions";
import * as R18 from "@/routes/api/admin__support";
import * as R19 from "@/routes/api/admin__users";

@Controller()
export class AdminController {

  @Get("/api/admin/audit")
  async getAdminAuditRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R1.GET(r as never, c as never));
  }

  @Post("/api/admin/auth/login")
  async postAdminAuthLoginRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R2.POST(r as never, c as never));
  }

  @Post("/api/admin/broadcast")
  async postAdminBroadcastRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R3.POST(r as never, c as never));
  }

  @Get("/api/admin/charts")
  async getAdminChartsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R4.GET(r as never, c as never));
  }

  @Get("/api/admin/discounts")
  async getAdminDiscountsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R5.GET(r as never, c as never));
  }

  @Post("/api/admin/discounts")
  async postAdminDiscountsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R5.POST(r as never, c as never));
  }

  @Patch("/api/admin/discounts/:id")
  async patchAdminDiscountsIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R6.PATCH(r as never, c as never));
  }

  @Delete("/api/admin/discounts/:id")
  async deleteAdminDiscountsIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R6.DELETE(r as never, c as never));
  }

  @Get("/api/admin/invoices")
  async getAdminInvoicesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R7.GET(r as never, c as never));
  }

  @Get("/api/admin/limits")
  async getAdminLimitsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R8.GET(r as never, c as never));
  }

  @Patch("/api/admin/limits")
  async patchAdminLimitsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R8.PATCH(r as never, c as never));
  }

  @Get("/api/admin/notifications")
  async getAdminNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R9.GET(r as never, c as never));
  }

  @Post("/api/admin/notifications")
  async postAdminNotificationsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R9.POST(r as never, c as never));
  }

  @Get("/api/admin/packages")
  async getAdminPackagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R10.GET(r as never, c as never));
  }

  @Patch("/api/admin/packages")
  async patchAdminPackagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R10.PATCH(r as never, c as never));
  }

  @Post("/api/admin/packages")
  async postAdminPackagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R10.POST(r as never, c as never));
  }

  @Delete("/api/admin/packages")
  async deleteAdminPackagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R10.DELETE(r as never, c as never));
  }

  @Get("/api/admin/reviews")
  async getAdminReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R11.GET(r as never, c as never));
  }

  @Delete("/api/admin/reviews")
  async deleteAdminReviewsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R11.DELETE(r as never, c as never));
  }

  @Get("/api/admin/saas-metrics")
  async getAdminSaasMetricsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R12.GET(r as never, c as never));
  }

  @Get("/api/admin/salons/:id")
  async getAdminSalonsIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R13.GET(r as never, c as never));
  }

  @Patch("/api/admin/salons/:id/status")
  async patchAdminSalonsIdStatusRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R14.PATCH(r as never, c as never));
  }

  @Get("/api/admin/settings")
  async getAdminSettingsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R15.GET(r as never, c as never));
  }

  @Patch("/api/admin/settings")
  async patchAdminSettingsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R15.PATCH(r as never, c as never));
  }

  @Post("/api/admin/sms/test")
  async postAdminSmsTestRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R16.POST(r as never, c as never));
  }

  @Get("/api/admin/subscriptions")
  async getAdminSubscriptionsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R17.GET(r as never, c as never));
  }

  @Patch("/api/admin/subscriptions")
  async patchAdminSubscriptionsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R17.PATCH(r as never, c as never));
  }

  @Get("/api/admin/support")
  async getAdminSupportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R18.GET(r as never, c as never));
  }

  @Patch("/api/admin/support")
  async patchAdminSupportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R18.PATCH(r as never, c as never));
  }

  @Get("/api/admin/users")
  async getAdminUsersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R19.GET(r as never, c as never));
  }

  @Patch("/api/admin/users")
  async patchAdminUsersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R19.PATCH(r as never, c as never));
  }
}
