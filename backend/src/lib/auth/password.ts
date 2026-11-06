import { prisma } from "@/lib/prisma";
import { httpError } from "@/lib/utils";
import { randomInt } from "node:crypto";

/**
 * تولید کد OTP تصادفی ۶ رقمی
 */
function generateOtp(): string {
  return Array.from({ length: 6 }, () => randomInt(0, 10)).join("");
}

/**
 * محدودیت تلاش ناموفق ورود با رمز عبور (ضد brute-force).
 * تلاش‌های ناموفق در جدول Otp با purpose=PASSWORD_FAIL ثبت می‌شوند
 * تا محدودیت بین اجراهای سرور هم پایدار بماند.
 *
 * توابع هش/بررسی رمز در passwordHash.ts هستند (بدون وابستگی به Prisma).
 */

const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 10 * 60 * 1000;

export async function assertLoginAllowed(login: string) {
  const recent = await prisma.otp.count({
    where: {
      phone: login,
      purpose: "PASSWORD_FAIL",
      // رکوردهای پاک‌شده (ورود موفق) نباید در شمارش قفل بمانند؛ قبلاً
      // `clearFailedLogins` فقط usedAt را پر می‌کرد ولی این کوئری همه را
      // می‌شمرد و کاربر پس از یک ورود موفق هم قفل می‌ماند.
      usedAt: null,
      createdAt: { gte: new Date(Date.now() - FAIL_WINDOW_MS) },
    },
  });
  if (recent >= MAX_FAILS) {
    throw httpError("تعداد تلاش‌های ناموفق زیاد است. ۱۰ دقیقه بعد دوباره تلاش کنید.", 429);
  }
}

export async function recordFailedLogin(login: string) {
  await prisma.otp.create({
    data: {
      phone: login,
      code: generateOtp(), // تغییر: کد تصادفی به جای ثابت
      purpose: "PASSWORD_FAIL",
      expiresAt: new Date(Date.now() + FAIL_WINDOW_MS),
    },
  });
}

export async function clearFailedLogins(login: string) {
  await prisma.otp.updateMany({
    where: { phone: login, purpose: "PASSWORD_FAIL", usedAt: null },
    data: { usedAt: new Date() },
  });
}

export { hashPassword, verifyPassword, passwordIssue, PASSWORD_MIN } from "./passwordHash";
