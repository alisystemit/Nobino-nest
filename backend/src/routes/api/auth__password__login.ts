// خودکار: پورت‌شده از src/app/api/auth/password/login/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  assertLoginAllowed,
  recordFailedLogin,
  clearFailedLogins,
} from "@/lib/auth/password";
import { issueSession, publicUser } from "@/lib/auth/session";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  login: z.string().min(5, "ایمیل یا شماره موبایل را وارد کنید"),
  password: z.string().min(1, "رمز عبور را وارد کنید"),
});

/**
 * ورود با رمز عبور (ایمیل یا شماره موبایل + رمز).
 * برای هر کاربری که رمز عبور تنظیم کرده باشد کار می‌کند؛
 * ورود ادمین پس از تنظیم رمز از همین مسیر انجام می‌شود.
 */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());
    const login = body.login.trim().toLowerCase();

    await assertLoginAllowed(login);

    const isEmail = login.includes("@");
    const user = await prisma.user.findFirst({
      where: isEmail ? { email: login } : { phone: login.startsWith("0") ? login : `0${login}` },
    });

    if (!user || !user.passwordHash) {
      await recordFailedLogin(login);
      return json(
        { success: false, error: "ایمیل/شماره یا رمز عبور اشتباه است." },
        { status: 401 }
      );
    }

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) {
      await recordFailedLogin(login);
      return json(
        { success: false, error: "ایمیل/شماره یا رمز عبور اشتباه است." },
        { status: 401 }
      );
    }

    await clearFailedLogins(login);

    await issueSession(user);

    return json({ success: true, user: publicUser(user) });
  } catch (err) {
    return apiError(err);
  }
}
