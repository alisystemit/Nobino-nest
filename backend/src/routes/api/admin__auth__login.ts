// خودکار: پورت‌شده از src/app/api/admin/auth/login/route.ts — بدون تغییر منطق
import { z } from "zod";
import { adminPasswordLogin } from "@/lib/auth/admin-login";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("ایمیل معتبر وارد کنید"),
  password: z.string().min(1, "رمز عبور را وارد کنید"),
});

/**
 * ورود اختصاصی سوپرادمین (ایمیل + رمز عبور، بدون پیامک).
 * صفحهٔ مربوط: /admin/login
 */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());
    const result = await adminPasswordLogin(body.email, body.password);
    if (!result.ok) return json({ success: false, error: result.error }, { status: 401 });
    return json({ success: true, token: result.token, user: result.user });
  } catch (err) {
    return apiError(err);
  }
}
