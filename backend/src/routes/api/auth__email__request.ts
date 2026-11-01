// خودکار: پورت‌شده از src/app/api/auth/email/request/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requestEmailOtp } from "@/lib/auth/otp";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());
    await requestEmailOtp(body.email.toLowerCase());
    return json({ success: true, message: "کد تأیید به ایمیل ارسال شد", expiresIn: 300 });
  } catch (err) {
    return apiError(err);
  }
}
