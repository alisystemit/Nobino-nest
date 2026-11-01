import { prisma } from "@/lib/prisma";
import {
  verifyPassword,
  assertLoginAllowed,
  recordFailedLogin,
  clearFailedLogins,
} from "@/lib/auth/password";
import { issueSession, publicUser } from "@/lib/auth/session";

/** پیام خطای یکسان — تا وجود/عدم وجود ایمیل از روی پاسخ حدس زده نشود */
const GENERIC_ERROR = "ایمیل یا رمز عبور اشتباه است.";

export type AdminLoginResult =
  | { ok: true; user: ReturnType<typeof publicUser> }
  | { ok: false; error: string };

/**
 * ورود سوپرادمین با ایمیل و رمز عبور — بدون پیامک/کد تأیید.
 *
 * فقط نقش `ADMIN` و کاربر فعال اجازه ورود دارد؛ قفل ضد‌brute-force
 * (`assertLoginAllowed`) همان مسیری است که ورود با رمز عادی استفاده می‌کند.
 * `assertLoginAllowed` هنگام قفل‌شدن استثنا می‌دهد؛ روت فراخوان آن را به
 * `apiError` می‌سپارد تا پیام «تعداد تلاش بیش از حد» برگردد.
 */
export async function adminPasswordLogin(email: string, password: string): Promise<AdminLoginResult> {
  const login = email.trim().toLowerCase();

  await assertLoginAllowed(login);

  const user = await prisma.user.findFirst({
    where: { email: { equals: login, mode: "insensitive" } },
  });

  if (!user || !user.passwordHash || user.role !== "ADMIN" || !user.isActive) {
    await recordFailedLogin(login);
    return { ok: false, error: GENERIC_ERROR };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordFailedLogin(login);
    return { ok: false, error: GENERIC_ERROR };
  }

  await clearFailedLogins(login);
  await issueSession(user);
  return { ok: true, user: publicUser(user) };
}
