/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R48 from "@/routes/api/dashboard__customers";
import * as R49 from "@/routes/api/dashboard__salons__id__appointments.csv";
import * as R50 from "@/routes/api/dashboard__salons__id__blocks";
import * as R51 from "@/routes/api/dashboard__salons__id__blocks__blockId";
import * as R52 from "@/routes/api/dashboard__salons__id__branches";
import * as R53 from "@/routes/api/dashboard__salons__id__branches__branchId";
import * as R54 from "@/routes/api/dashboard__salons__id__campaigns";
import * as R55 from "@/routes/api/dashboard__salons__id__campaigns__campaignId__run";
import * as R56 from "@/routes/api/dashboard__salons__id__cash";
import * as R57 from "@/routes/api/dashboard__salons__id__customers";
import * as R58 from "@/routes/api/dashboard__salons__id__customers__customerId";
import * as R59 from "@/routes/api/dashboard__salons__id__customers__customerId__media";
import * as R60 from "@/routes/api/dashboard__salons__id__customers__customerId__notes__noteId";
import * as R61 from "@/routes/api/dashboard__salons__id__customers__customerId__notes";
import * as R62 from "@/routes/api/dashboard__salons__id__domain";
import * as R63 from "@/routes/api/dashboard__salons__id__domain__verify";
import * as R64 from "@/routes/api/dashboard__salons__id__excel";
import * as R65 from "@/routes/api/dashboard__salons__id__financial";
import * as R66 from "@/routes/api/dashboard__salons__id__holidays";
import * as R67 from "@/routes/api/dashboard__salons__id__holidays__holidayId";
import * as R68 from "@/routes/api/dashboard__salons__id__hours";
import * as R69 from "@/routes/api/dashboard__salons__id__images";
import * as R70 from "@/routes/api/dashboard__salons__id__import__appointments";
import * as R71 from "@/routes/api/dashboard__salons__id__import__customers";
import * as R72 from "@/routes/api/dashboard__salons__id__invoices";
import * as R73 from "@/routes/api/dashboard__salons__id__invoices__invoiceId__resend";
import * as R74 from "@/routes/api/dashboard__salons__id__reminders";
import * as R75 from "@/routes/api/dashboard__salons__id__report";
import * as R76 from "@/routes/api/dashboard__salons__id__revenue";
import * as R77 from "@/routes/api/dashboard__salons__id";
import * as R78 from "@/routes/api/dashboard__salons__id__services";
import * as R79 from "@/routes/api/dashboard__salons__id__services__serviceId";
import * as R80 from "@/routes/api/dashboard__salons__id__staff";
import * as R81 from "@/routes/api/dashboard__salons__id__staff__staffId";
import * as R82 from "@/routes/api/dashboard__salons__id__webhooks";
import * as R83 from "@/routes/api/dashboard__salons__id__webhooks__webhookId";
import * as R84 from "@/routes/api/dashboard__stats";

@Controller()
export class DashboardController {

  @Get("/api/dashboard/customers")
  async getDashboardCustomersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R48.GET(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/appointments.csv")
  async getDashboardSalonsIdAppointmentsCsvRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R49.GET(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/blocks")
  async getDashboardSalonsIdBlocksRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R50.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/blocks")
  async postDashboardSalonsIdBlocksRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R50.POST(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/blocks/:blockId")
  async deleteDashboardSalonsIdBlocksBlockIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R51.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/branches")
  async getDashboardSalonsIdBranchesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R52.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/branches")
  async postDashboardSalonsIdBranchesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R52.POST(r as never, c as never));
  }

  @Patch("/api/dashboard/salons/:id/branches/:branchId")
  async patchDashboardSalonsIdBranchesBranchIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R53.PATCH(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/branches/:branchId")
  async deleteDashboardSalonsIdBranchesBranchIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R53.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/campaigns")
  async getDashboardSalonsIdCampaignsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R54.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/campaigns")
  async postDashboardSalonsIdCampaignsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R54.POST(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/campaigns/:campaignId/run")
  async postDashboardSalonsIdCampaignsCampaignIdRunRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R55.POST(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/cash")
  async getDashboardSalonsIdCashRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R56.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/cash")
  async postDashboardSalonsIdCashRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R56.POST(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/customers")
  async getDashboardSalonsIdCustomersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R57.GET(r as never, c as never));
  }

  @Patch("/api/dashboard/salons/:id/customers")
  async patchDashboardSalonsIdCustomersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R57.PATCH(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/customers")
  async postDashboardSalonsIdCustomersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R57.POST(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/customers/:customerId")
  async getDashboardSalonsIdCustomersCustomerIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R58.GET(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/customers/:customerId/media")
  async getDashboardSalonsIdCustomersCustomerIdMediaRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R59.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/customers/:customerId/media")
  async postDashboardSalonsIdCustomersCustomerIdMediaRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R59.POST(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/customers/:customerId/media")
  async deleteDashboardSalonsIdCustomersCustomerIdMediaRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R59.DELETE(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/customers/:customerId/notes/:noteId")
  async deleteDashboardSalonsIdCustomersCustomerIdNotesNoteIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R60.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/customers/:customerId/notes")
  async getDashboardSalonsIdCustomersCustomerIdNotesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R61.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/customers/:customerId/notes")
  async postDashboardSalonsIdCustomersCustomerIdNotesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R61.POST(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/domain")
  async postDashboardSalonsIdDomainRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R62.POST(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/domain/verify")
  async postDashboardSalonsIdDomainVerifyRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R63.POST(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/excel")
  async getDashboardSalonsIdExcelRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R64.GET(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/financial")
  async getDashboardSalonsIdFinancialRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R65.GET(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/holidays")
  async getDashboardSalonsIdHolidaysRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R66.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/holidays")
  async postDashboardSalonsIdHolidaysRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R66.POST(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/holidays/:holidayId")
  async deleteDashboardSalonsIdHolidaysHolidayIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R67.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/hours")
  async getDashboardSalonsIdHoursRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R68.GET(r as never, c as never));
  }

  @Put("/api/dashboard/salons/:id/hours")
  async putDashboardSalonsIdHoursRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R68.PUT(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/images")
  async postDashboardSalonsIdImagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R69.POST(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/images")
  async deleteDashboardSalonsIdImagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R69.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/images")
  async getDashboardSalonsIdImagesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R69.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/import/appointments")
  async postDashboardSalonsIdImportAppointmentsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R70.POST(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/import/customers")
  async postDashboardSalonsIdImportCustomersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R71.POST(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/invoices")
  async getDashboardSalonsIdInvoicesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R72.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/invoices")
  async postDashboardSalonsIdInvoicesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R72.POST(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/invoices/:invoiceId/resend")
  async postDashboardSalonsIdInvoicesInvoiceIdResendRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R73.POST(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/reminders")
  async getDashboardSalonsIdRemindersRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R74.GET(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/report")
  async getDashboardSalonsIdReportRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R75.GET(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/revenue")
  async getDashboardSalonsIdRevenueRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R76.GET(r as never, c as never));
  }

  @Patch("/api/dashboard/salons/:id")
  async patchDashboardSalonsIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R77.PATCH(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id")
  async deleteDashboardSalonsIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R77.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/services")
  async getDashboardSalonsIdServicesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R78.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/services")
  async postDashboardSalonsIdServicesRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R78.POST(r as never, c as never));
  }

  @Patch("/api/dashboard/salons/:id/services/:serviceId")
  async patchDashboardSalonsIdServicesServiceIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R79.PATCH(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/services/:serviceId")
  async deleteDashboardSalonsIdServicesServiceIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R79.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/staff")
  async getDashboardSalonsIdStaffRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R80.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/staff")
  async postDashboardSalonsIdStaffRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R80.POST(r as never, c as never));
  }

  @Patch("/api/dashboard/salons/:id/staff/:staffId")
  async patchDashboardSalonsIdStaffStaffIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R81.PATCH(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/staff/:staffId")
  async deleteDashboardSalonsIdStaffStaffIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R81.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/salons/:id/webhooks")
  async getDashboardSalonsIdWebhooksRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R82.GET(r as never, c as never));
  }

  @Post("/api/dashboard/salons/:id/webhooks")
  async postDashboardSalonsIdWebhooksRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R82.POST(r as never, c as never));
  }

  @Delete("/api/dashboard/salons/:id/webhooks/:webhookId")
  async deleteDashboardSalonsIdWebhooksWebhookIdRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R83.DELETE(r as never, c as never));
  }

  @Get("/api/dashboard/stats")
  async getDashboardStatsRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R84.GET(r as never, c as never));
  }
}
