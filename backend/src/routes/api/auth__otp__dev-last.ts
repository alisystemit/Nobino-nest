// خودکار: پورت‌شده از src/app/api/auth/otp/dev-last/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { json } from "@/lib/utils";
import { canShowSentCodes } from "@/lib/auth/code-display";

/**
 * آخرین کد تأیید ارسال‌شده برای یک شماره/ایمیل.
 *
 * در محیط توسعه همیشه در دسترس است؛ در پروداکشن تنها وقتی سوپرادمین سوئیچ
 * «نمایش کدهای ارسالی» (کلید `sms.show_sent_codes`) را روشن کرده باشد.
 * با خاموش بودن سوئیچ، مسیر مثل قبل ۴۰۴ می‌دهد و کدی فاش نمی‌شود.
 */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  if (!(await canShowSentCodes())) {
    return json({ success: false, error: "not available" }, { status: 404 });
  }

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
