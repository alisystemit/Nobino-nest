/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R25 from "@/routes/api/ai__analyze";
import * as R26 from "@/routes/api/ai__chat";
import * as R27 from "@/routes/api/ai__generate-content";
import * as R123 from "@/routes/api/voice__transcribe";

@Controller()
export class AiController {

  @Post("/api/ai/analyze")
  async postAiAnalyzeRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R25.POST(r as never, c as never));
  }

  @Post("/api/ai/chat")
  async postAiChatRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R26.POST(r as never, c as never));
  }

  @Post("/api/ai/generate-content")
  async postAiGenerateContentRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R27.POST(r as never, c as never));
  }

  @Post("/api/voice/transcribe")
  async postVoiceTranscribeRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R123.POST(r as never, c as never));
  }
}
