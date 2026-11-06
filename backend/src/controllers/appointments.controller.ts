/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R28 from "@/routes/api/appointments__hold__confirm";
import * as R29 from "@/routes/api/appointments__hold";
import * as R31 from "@/routes/api/appointments__id__cancel";
import * as R32 from "@/routes/api/appointments__id__reschedule";
import * as R33 from "@/routes/api/appointments__id";

@Controller()
export class AppointmentsController {

  @Post("/api/appointments/hold/confirm")
  async postAppointmentsHoldConfirmRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R28.POST(r as never, c as never));
  }

  @Post("/api/appointments/hold")
  async postAppointmentsHoldRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R29.POST(r as never, c as never));
  }

  @Post("/api/appointments/:id/cancel")
  async postAppointmentsIdCancelRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R31.POST(r as never, c as never));
  }

  @Post("/api/appointments/:id/reschedule")
  async postAppointmentsIdRescheduleRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R32.POST(r as never, c as never));
  }

  @Patch("/api/appointments/:id")
  async patchAppointmentsIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R33.PATCH(r as never, c as never));
  }
}
