/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R23 from "@/routes/api/appointments__hold__confirm";
import * as R24 from "@/routes/api/appointments__hold";
import * as R26 from "@/routes/api/appointments__id__cancel";
import * as R27 from "@/routes/api/appointments__id__reschedule";
import * as R28 from "@/routes/api/appointments__id";

@Controller()
export class AppointmentsController {

  @Post("/api/appointments/hold/confirm")
  async postAppointmentsHoldConfirmRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R23.POST(r as never, c as never));
  }

  @Post("/api/appointments/hold")
  async postAppointmentsHoldRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R24.POST(r as never, c as never));
  }

  @Post("/api/appointments/:id/cancel")
  async postAppointmentsIdCancelRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R26.POST(r as never, c as never));
  }

  @Post("/api/appointments/:id/reschedule")
  async postAppointmentsIdRescheduleRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R27.POST(r as never, c as never));
  }

  @Patch("/api/appointments/:id")
  async patchAppointmentsIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R28.PATCH(r as never, c as never));
  }
}
