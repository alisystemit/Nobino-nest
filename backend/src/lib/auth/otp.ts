import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSmsProvider } from "@/lib/sms/provider";
import { getEmailSender } from "@/lib/email/provider";

const OTP_TTL_MS = 5 * 60 * 1000; // ۵ دقیقه
// در پروداکشن سخت‌گیرانه (ضد اسپم)؛ در توسعه بالاتر تا تست‌های E2E مکرر قفل نشوند
const MAX_ATTEMPTS = process.env.NODE_ENV === "production" ? 5 : 50;

/** تولید کد ۴ رقمی با مولد امن (نه Math.random) */
function generateCode(): string {
  return String(randomInt(1000, 10000));
}

/**
 * شناسه ساختگی برای کاربرانی که فقط با ایمیل ثبت‌نام می‌کنند.
 * فیلد phone در دیتابیس اجباری و یکتاست؛ از هش قطعی ایمیل استفاده می‌کنیم
 * تا برای یک ایمیل همیشه همان مقدار ساخته شود و تصادفی/قابل‌حدس نباشد.
 */
function syntheticPhoneForEmail(email: string): string {
  const hash = createHash("sha256").update(email.toLowerCase()).digest("hex");
  return `email:${hash.slice(0, 24)}`;
}

/** ابطال کدهای قبلیِ استفاده‌نشده تا فقط آخرین کد معتبر باشد. */
async function invalidatePrevious(phone: string, purpose: string) {
  await prisma.otp.updateMany({
    where: { phone, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });
}

/** ارسال کد تأیید از طریق ایمیل (برای ورود با ایمیل) */
export async function requestEmailOtp(email: string) {
  const normalized = email.toLowerCase().trim();
  const code = generateCode();

  const recent = await prisma.otp.count({
    where: { phone: normalized, purpose: "EMAIL_LOGIN", createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  if (recent >= MAX_ATTEMPTS) throw new Error("تعداد درخواست‌ها بیش از حد مجاز است");

  await invalidatePrevious(normalized, "EMAIL_LOGIN");
  await prisma.otp.create({
    data: { phone: normalized, code, purpose: "EMAIL_LOGIN", expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  const sender = await getEmailSender();
  await sender.sendEmail(normalized, "کد ورود به نوبینو", `کد تأیید شما: <b>${code}</b>`);
  return { expiresIn: OTP_TTL_MS / 1000 };
}

export async function requestOtp(phone: string) {
  const code = generateCode(); // ۴ رقم

  // محدودیت تعداد درخواست (ضد اسپم ساده)
  const recentCount = await prisma.otp.count({
    where: { phone, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
  });
  if (recentCount >= MAX_ATTEMPTS) {
    throw new Error("تعداد درخواست‌های کد بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.");
  }

  await invalidatePrevious(phone, "LOGIN");
  await prisma.otp.create({
    data: { phone, code, purpose: "LOGIN", expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  // لاگ قطعی کد در کنسول سرور (در حالت توسعه)
  console.log("\n════════════════════════════════════════════");
  console.log(`  🔐 کد تأیید برای ${phone}: ${code}`);
  console.log("════════════════════════════════════════════\n");

  await (await getSmsProvider()).sendOtp(phone, code);
  return { expiresIn: OTP_TTL_MS / 1000 };
}

export async function verifyOtp(phone: string, code: string, purpose = "LOGIN") {
  const record = await prisma.otp.findFirst({
    where: { phone, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw new Error("کد واردشده صحیح نیست.");
  }
  if (record.expiresAt < new Date()) {
    throw new Error("کد منقضی شده است. دوباره درخواست دهید.");
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    throw new Error("تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید درخواست کنید.");
  }

  // مقایسه کد و ثبت تلاش ناموفق (جلوگیری از brute-force روی کد ۴ رقمی)
  if (record.code !== code) {
    await prisma.otp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 }, usedAt: record.attempts + 1 >= MAX_ATTEMPTS ? new Date() : null },
    });
    throw new Error("کد واردشده صحیح نیست.");
  }

  await prisma.otp.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  // پیدا کردن یا ساخت کاربر
  let user =
    purpose === "EMAIL_LOGIN"
      ? await prisma.user.findUnique({ where: { email: phone } })
      : await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    user =
      purpose === "EMAIL_LOGIN"
        ? await prisma.user.create({
            data: {
              email: phone,
              phone: syntheticPhoneForEmail(phone),
              name: phone.split("@")[0]?.slice(0, 60),
              role: "CUSTOMER",
              verifiedAt: new Date(),
            },
          })
        : await prisma.user.create({ data: { phone, role: "CUSTOMER", verifiedAt: new Date() } });
  } else if (!user.verifiedAt) {
    user = await prisma.user.update({ where: { id: user.id }, data: { verifiedAt: new Date() } });
  }

  return user;
}
