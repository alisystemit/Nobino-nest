import { createHash } from "node:crypto";
import { cookies, headers } from "@/compat/next-headers";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth/jwt";
import { AUTH_COOKIE } from "@/lib/auth/guards";
import { resolveCookieSecure } from "@/lib/auth/cookie-secure";

/** مدت اعتبار نشست (۷ روز) — در کوکی و رکورد دیتابیس یکسان استفاده می‌شود */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SessionUser = { id: string; phone: string; role: string };

/** پروتکل اعلام‌شده توسط پروکس جلوی اپ (Apache/Nginx) */
async function requestProto(): Promise<string | null> {
  try {
    const hdrs = await headers();
    return (
      hdrs.get("x-forwarded-proto") ??
      hdrs.get("x-forwarded-protocol") ??
      hdrs.get("x-url-type") ??
      hdrs.get("front-end-https") ??
      hdrs.get("x-real-scheme")
    );
  } catch {
    // خارج از زمینهٔ درخواست (مثلاً در اسکریپت) — بدون هدر
    return null;
  }
}

/**
 * آیا کوکی نشست باید پرچم `Secure` بگیرد؟
 * منطق تصمیم در `resolveCookieSecure` (تابع خالص و قابل تست) آمده است.
 */
export async function authCookieSecure(): Promise<boolean> {
  return resolveCookieSecure({
    flag: process.env.AUTH_COOKIE_SECURE,
    proto: await requestProto(),
  });
}

/**
 * صدور نشست مشترک همهٔ مسیرهای ورود (OTP، رمز عبور، ورود سوپرادمین):
 * توکن JWT + رکورد `Session` (هش ۲۵۶ توکن) + کوکی httpOnly.
 *
 * ثبت نشست در دیتابیس اختیاری است؛ اگر شکست بخورد فقط لاگ می‌شود و
 * کوکی همچنان ست می‌شود (رفتار قبلی حفظ شده است).
 */
export async function issueSession(user: SessionUser): Promise<string> {
  const token = await signToken({ sub: user.id, phone: user.phone, role: user.role });

  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || null;
    const device = hdrs.get("user-agent") || null;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        device,
        ip,
      },
    });
  } catch (err) {
    console.error("session record failed:", err);
  }

  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: await authCookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return token;
}

/** نمای کاربر برای پاسخ API — هرگز فیلد محرمانه‌ای (مثل passwordHash) ندارد */
export function publicUser(user: { id: string; phone: string; email: string | null; name: string | null; role: string }) {
  return { id: user.id, phone: user.phone, email: user.email, name: user.name, role: user.role };
}
