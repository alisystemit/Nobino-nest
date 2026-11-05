// خودکار: پورت‌شده از src/app/api/ai/chat/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assistantReply } from "@/lib/ai/assistant";
import { json, apiError } from "@/lib/utils";
import { checkRate, clientIpFromRequest, numericSettingOrEnv, tooManyRequests } from "@/lib/rate-limit-lite";

const schema = z.object({
  salonId: z.string(),
  // C20: پیام پیش‌فرض zod انگلیسی بود و کلاینت آن را با «متوجه نشدم» جایگزین می‌کرد؛
  // حالا متن فارسی است و کاربر دلیل واقعی خطا را می‌بیند.
  question: z
    .string()
    .min(1, "سؤال را بنویسید.")
    .max(1000, "سؤال خیلی بلند است؛ کوتاه‌تر بپرسید (حداکثر ۱۰۰۰ نویسه)."),
  customerName: z.string().optional(),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());
    const salon = await prisma.salon.findUnique({ where: { id: body.salonId } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    // دستیار عمومی است (روی صفحهٔ سالن)، پس هزینهٔ LLM با سقف نرخ مهار می‌شود:
    // هم به ازای هر IP، هم به ازای هر IP+سالن، و یک بودجهٔ روزانه برای هر سالن.
    const ip = clientIpFromRequest(req);
    const perMinute = await numericSettingOrEnv("ai.chat_rate_per_minute", process.env.AI_CHAT_RATE_PER_MINUTE, 8);
    const perDayPerSalon = await numericSettingOrEnv("ai.chat_rate_per_day", process.env.AI_CHAT_RATE_PER_DAY, 400);
    if (perMinute > 0) {
      const minute = checkRate(`ai-chat:${ip}`, perMinute, 60_000);
      if (!minute.ok) return tooManyRequests(minute.retryAfterSec, "برای پرسش دستیار کمی صبر کنید.");
      const salonMinute = checkRate(`ai-chat:${ip}:${salon.id}`, perMinute, 60_000);
      if (!salonMinute.ok) return tooManyRequests(salonMinute.retryAfterSec, "برای پرسش دستیار کمی صبر کنید.");
    }
    if (perDayPerSalon > 0) {
      const day = checkRate(`ai-chat-day:${salon.id}:${new Date().toISOString().slice(0, 10)}`, perDayPerSalon, 86_400_000);
      if (!day.ok) return tooManyRequests(day.retryAfterSec, "سقف پرسش دستیار این سالن برای امروز پر شده است.");
    }

    const { reply, usedAI } = await assistantReply(body.question, { salonId: body.salonId, customerName: body.customerName });
    return json({ success: true, reply, usedAI });
  } catch (err) {
    return apiError(err);
  }
}
