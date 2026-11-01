// خودکار: پورت‌شده از src/app/api/auth/password/status/route.ts — بدون تغییر منطق
import { requireAuth } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";

/** وضعیت رمز عبور کاربر جاری (بدون افشای هش) */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    return json({ success: true, hasPassword: Boolean(user.passwordHash) });
  } catch (err) {
    return apiError(err);
  }
}
