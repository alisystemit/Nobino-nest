// خودکار: پورت‌شده از src/app/api/admin/sms/test/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { createSmsProvider } from "@/lib/sms/providers";
import { json, apiError, httpError } from "@/lib/utils";
import { checkRate, clientIpFromRequest, tooManyRequests } from "@/lib/rate-limit-lite";

const schema = z.object({
  provider: z.string().max(40, "نام سرویس نامعتبر است"),
  phone: z.string().regex(/^0?9\d{9}$/),
});

/** ارسال پیامک آزمایشی با سرویس مشخص (بدون ذخیره) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    // سقف مصرف: جلوگیری از سوختن اعتبار پیامکی با درخواست‌های پشت‌سرهم
    const ip = clientIpFromRequest(req);
    const rl = checkRate(`admin-sms-test:${ip}`, 10, 10 * 60 * 1000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec, "تعداد پیامک‌های آزمایشی زیاد است. کمی بعد دوباره تلاش کنید.");

    const body = schema.parse(await req.json());
    const phone = body.phone.startsWith("0") ? body.phone : `0${body.phone}`;

    const provider = await createSmsProvider(body.provider).catch((e) => {
      throw httpError(`کلیدهای «${body.provider}» کامل نیست. ${e.message}`, 400);
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

