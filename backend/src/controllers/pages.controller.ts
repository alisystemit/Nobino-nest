/**
 * کنترلر دیتای صفحات — GET /api/pages/:name
 * لودرها در src/loaders/page-loaders.ts تعریف شده‌اند و داخل زمینهٔ درخواست
 * (ALS) اجرا می‌شوند تا getCurrentUser/cookies کار کند.
 */
import { Controller, Get, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import { json } from "@/lib/utils";
import { PAGE_LOADERS } from "@/loaders/page-loaders";

@Controller()
export class PagesController {
  @Get("/api/pages/:name")
  async page(@Req() req: Request, @Res() res: Response) {
    const name = (req.params as { name: string }).name;
    const loader = PAGE_LOADERS[name];
    if (!loader) {
      res.status(404).json({ success: false, error: `Unknown page loader: ${name}` });
      return;
    }
    await runRoute(req, res, async (r) => {
      const url = new URL(r.url, "http://local");
      const data = await loader(url);
      return json({ success: true, data });
    });
  }
}
