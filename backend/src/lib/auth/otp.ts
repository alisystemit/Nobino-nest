import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSmsProvider } from "@/lib/sms/provider";
import { getEmailSender } from "@/lib/email/provider";
import { httpError } from "@/lib/utils";
import { isDevelopmentEnv } from "@/lib/env";

const OTP_TTL_MS = 5 * 60 * 1000; // ۵ دقیقه
// در پروداکشن سخت‌گیرانه (ضد اسپم)؛ در توسعه بالاتر تا تست‌های E2E مکرر قفل نشوند
const MAX_ATTEMPTS = process.env.NODE_ENV === "production" ? 5 : 50;

/**
 * گارد ضداسپم شمارهٔ مجازی: حداکثر ۳ پیامک بدون لاگین موفق؛ بعد از آن
 * شماره تا ۵ ساعت قفل می‌شود. با هر تأیید موفق، شمارش از صفر شروع می‌شود.
 * مقادیر با env قابل تنظیم‌اند (برای تست: OTP_MAX_SENDS / OTP_LOCK_MINUTES).
 */
const MAX_SENDS_PER_NUMBER = Number(process.env.OTP_MAX_SENDS ?? 3);
const OTP_LOCK_MS = Number(process.env.OTP_LOCK_MINUTES ?? 5 * 60) * 60 * 1000;

/** باقی‌ماندهٔ قفل به فارسی — «۴ ساعت و ۱۲ دقیقه» */
function remainingFa(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const fa = (n: number) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  if (h && m) return `${fa(h)} ساعت و ${fa(m)} دقیقه`;
  if (h) return `${fa(h)} ساعت`;
  return `${fa(m)} دقیقه`;
}

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

  // ── گارد ضداسپم: ۳ پیامک بدون لاگین موفق → قفل ۵ ساعتهٔ شماره ──────
  // ملاک «لاگین موفق»، آخرین کدِ verifiedِ همین شماره است؛ همهٔ کدهای
  // ارسال‌شده بعد از آن (یا همه در صورت نبود لاگین موفق) شمارش می‌شوند.
  const lastSuccess = await prisma.otp.findFirst({
    where: { phone, purpose: "LOGIN", verified: true },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const streak = await prisma.otp.findMany({
    where: { phone, purpose: "LOGIN", createdAt: { gt: lastSuccess?.createdAt ?? new Date(0) } },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true },
  });
  if (streak.length >= MAX_SENDS_PER_NUMBER) {
    const lockUntil = streak[0].createdAt.getTime() + OTP_LOCK_MS;
    if (Date.now() < lockUntil) {
      throw httpError(
        `شما ${streak.length} بار کد درخواست کردید و وارد نشدید. تا ${remainingFa(lockUntil - Date.now())} دیگر با این شماره نمی‌توانید کد بگیرید.`,
        429
      );
    }
    // قفل گذشته است؛ پروندهٔ کدهای کهنه پاک می‌شود تا این شماره ۳ فرصت تازه داشته باشد
    await prisma.otp.deleteMany({ where: { id: { in: streak.map((s) => s.id) } } });
  }

  await invalidatePrevious(phone, "LOGIN");
  await prisma.otp.create({
    data: { phone, code, purpose: "LOGIN", expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  // لاگ قطعی کد در کنسول سرور — فقط در محیط توسعهٔ صریح (NODE_ENV خالی حساب نیست)
  if (isDevelopmentEnv()) {
    console.log("\n════════════════════════════════════════════");
    console.log(`  🔐 کد تأیید برای ${phone}: ${code}`);
    console.log("════════════════════════════════════════════\n");
  }

  await (await getSmsProvider()).sendOtp(phone, code);
  return { expiresIn: OTP_TTL_MS / 1000 };
}

export async function verifyOtp(phone: string, code: string, purpose = "LOGIN") {
  const record = await prisma.otp.findFirst({
    where: { phone, purpose, usedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    throw httpError("کد واردشده صحیح نیست.", 400);
  }
  if (record.expiresAt < new Date()) {
    throw httpError("کد منقضی شده است. دوباره درخواست دهید.", 400);
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    throw httpError("تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد جدید درخواست کنید.", 400);
  }

  // مقایسه کد و ثبت تلاش ناموفق (جلوگیری از brute-force روی کد ۴ رقمی)
  if (record.code !== code) {
    await prisma.otp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 }, usedAt: record.attempts + 1 >= MAX_ATTEMPTS ? new Date() : null },
    });
    throw httpError("کد واردشده صحیح نیست.", 400);
  }

  // لاگین موفق — همین رکورد شمارش اسپم را ریست می‌کند
  await prisma.otp.update({ where: { id: record.id }, data: { usedAt: new Date(), verified: true } });

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
