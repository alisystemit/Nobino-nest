// خودکار: پورت‌شده از src/app/api/admin/sms/test/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createSmsProvider } from "@/lib/sms/providers";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  provider: z.string(),
  phone: z.string().regex(/^0?9\d{9}$/),
});

/** ارسال پیامک آزمایشی با سرویس مشخص (بدون ذخیره) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const body = schema.parse(await req.json());
    const phone = body.phone.startsWith("0") ? body.phone : `0${body.phone}`;

    const provider = await createSmsProvider(body.provider).catch((e) => {
      throw new Error(`کلیدهای «${body.provider}» کامل نیست. ${e.message}`);
    });
    if (!provider.isConfigured()) {
      return json({ success: false, error: "کلیدهای این سرویس تنظیم نشده‌اند" }, { status: 400 });
    }

    await provider.sendText(phone, "پیامک آزمایشی از نوبینو ✅");
    return json({ success: true, message: `پیامک آزمایشی به ${phone} ارسال شد.` });
  } catch (err) {
    return apiError(err);
  }
}

