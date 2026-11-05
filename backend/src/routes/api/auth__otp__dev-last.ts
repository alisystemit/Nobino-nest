// خودکار: پورت‌شده از src/app/api/auth/otp/dev-last/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/utils";
import { canShowSentCodes } from "@/lib/auth/code-display";
import { checkRate, clientIpFromRequest, tooManyRequests } from "@/lib/rate-limit-lite";

/**
 * آخرین کد تأیید ارسال‌شده برای یک شماره/ایمیل.
 *
 * فقط در محیط توسعهٔ صریح یا وقتی سوپرادمین سوئیچ «نمایش کدهای ارسالی»
 * (کلید `sms.show_sent_codes`) را روشن کرده باشد در دسترس است؛ در غیر این
 * صورت مثل قبل ۴۰۴ می‌دهد و کدی فاش نمی‌شود.
 */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  if (!(await canShowSentCodes())) {
    return json({ success: false, error: "not available" }, { status: 404 });
  }

  // حتی با سوئیچ روشن هم باید سقف تعداد داشته باشد؛ این مسیر کد OTP هر
  // شماره‌ای را برمی‌گرداند و نباید وسیلهٔ بروت‌فورس شود.
  const ip = clientIpFromRequest(req);
  const rl = checkRate(`otp-dev-last:${ip}`, 30, 10 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec, "درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.");

  const sp = new URL(req.url).searchParams;
  const phone = sp.get("phone") ?? "";
  const email = sp.get("email") ?? "";
  if (!phone && !email) return json({ success: false, error: "phone or email required" }, { status: 400 });

  const record = email
    ? await prisma.otp.findFirst({
        where: { phone: email, purpose: "EMAIL_LOGIN", usedAt: null },
        orderBy: { createdAt: "desc" },
        select: { code: true, expiresAt: true },
      })
    : await prisma.otp.findFirst({
        where: { phone, purpose: "LOGIN", usedAt: null },
        orderBy: { createdAt: "desc" },
        select: { code: true, expiresAt: true },
      });

  if (!record) return json({ success: false, code: null });
  return json({ success: true, code: record.code, expiresAt: record.expiresAt });
}
