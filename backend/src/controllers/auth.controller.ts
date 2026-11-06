/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R34 from "@/routes/api/auth__email__request";
import * as R35 from "@/routes/api/auth__email__verify";
import * as R36 from "@/routes/api/auth__logout";
import * as R37 from "@/routes/api/auth__me";
import * as R38 from "@/routes/api/auth__otp__dev-last";
import * as R39 from "@/routes/api/auth__otp__request";
import * as R40 from "@/routes/api/auth__otp__verify";
import * as R41 from "@/routes/api/auth__password__login";
import * as R42 from "@/routes/api/auth__password__set";
import * as R43 from "@/routes/api/auth__password__status";
import * as R44 from "@/routes/api/auth__sessions";

@Controller()
export class AuthController {

  @Post("/api/auth/email/request")
  async postAuthEmailRequestRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R34.POST(r as never, c as never));
  }

  @Post("/api/auth/email/verify")
  async postAuthEmailVerifyRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R35.POST(r as never, c as never));
  }

  @Post("/api/auth/logout")
  async postAuthLogoutRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R36.POST(r as never, c as never));
  }

  @Get("/api/auth/me")
  async getAuthMeRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R37.GET(r as never, c as never));
  }

  @Patch("/api/auth/me")
  async patchAuthMeRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R37.PATCH(r as never, c as never));
  }

  @Get("/api/auth/otp/dev-last")
  async getAuthOtpDevLastRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R38.GET(r as never, c as never));
  }

  @Post("/api/auth/otp/request")
  async postAuthOtpRequestRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R39.POST(r as never, c as never));
  }

  @Post("/api/auth/otp/verify")
  async postAuthOtpVerifyRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R40.POST(r as never, c as never));
  }

  @Post("/api/auth/password/login")
  async postAuthPasswordLoginRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R41.POST(r as never, c as never));
  }

  @Post("/api/auth/password/set")
  async postAuthPasswordSetRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R42.POST(r as never, c as never));
  }

  @Get("/api/auth/password/status")
  async getAuthPasswordStatusRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R43.GET(r as never, c as never));
  }

  @Get("/api/auth/sessions")
  async getAuthSessionsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R44.GET(r as never, c as never));
  }

  @Delete("/api/auth/sessions")
  async deleteAuthSessionsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R44.DELETE(r as never, c as never));
  }
}
