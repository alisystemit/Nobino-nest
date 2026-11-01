/** خودکار — تولیدشده توسط scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
import * as R20 from "@/routes/api/ai__analyze";
import * as R21 from "@/routes/api/ai__chat";
import * as R22 from "@/routes/api/ai__generate-content";
import * as R107 from "@/routes/api/voice__transcribe";

@Controller()
export class AiController {

  @Post("/api/ai/analyze")
  async postAiAnalyzeRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R20.POST(r as never, c as never));
  }

  @Post("/api/ai/chat")
  async postAiChatRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R21.POST(r as never, c as never));
  }

  @Post("/api/ai/generate-content")
  async postAiGenerateContentRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R22.POST(r as never, c as never));
  }

  @Post("/api/voice/transcribe")
  async postVoiceTranscribeRoute(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => R107.POST(r as never, c as never));
  }
}
