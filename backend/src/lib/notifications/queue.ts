import { prisma } from "@/lib/prisma";
import { sendSmsWithFallback } from "@/lib/sms/provider";
import { getEmailSender } from "@/lib/email/provider";
import { checkLimit } from "@/lib/plans/limits";

const MAX_ATTEMPTS = 5;

export type EnqueueResult = { queued: boolean; reason?: "DUPLICATE" | "SMS_LIMIT"; message?: string };

/**
 * قرار دادن پیامک در صف (با حذف تکراری از طریق uniqueKey).
 *
 * اگر `salonId` داده شود، سقف «پیامک ارسالی در ماه» همان پلن بررسی می‌شود و در
 * صورت پر شدن سقف، پیامک ثبت نمی‌شود (بهجای خطا؛ جریان اصلی مثل ثبت نوبت نباید
 * با شکست پیامک متوقف شود). پیامک‌های سطح پلتفرم مثل OTP که سالن ندارند،
 * هرگز محدود نمی‌شوند.
 */
export async function enqueueSms(params: {
  type: string;
  recipient: string;
  message: string;
  uniqueKey?: string;
  delayMs?: number;
  salonId?: string | null;
}): Promise<EnqueueResult> {
  if (params.uniqueKey) {
    const existing = await prisma.notification.findUnique({
      where: { uniqueKey: params.uniqueKey },
      select: { status: true },
    });
    if (existing && existing.status !== "FAILED") return { queued: false, reason: "DUPLICATE" };
  }

  if (params.salonId) {
    const check = await checkLimit({ salonId: params.salonId }, "smsPerMonth");
    if (!check.allowed) {
      await notifySmsLimit(params.salonId, check.message, params.recipient);
      return { queued: false, reason: "SMS_LIMIT", message: check.message };
    }
  }

  await prisma.notification.create({
    data: {
      type: params.type,
      channel: "SMS",
      recipient: params.recipient,
      salonId: params.salonId ?? undefined,
      payload: { message: params.message },
      uniqueKey: params.uniqueKey,
      status: "PENDING",
      nextAttemptAt: new Date(Date.now() + (params.delayMs ?? 0)),
    },
  });
  return { queued: true };
}

/**
 * یک اعلان داخل‌برنامه‌ای که سالندار بفهمد سقف پیامک ماهش پر شده (حداکثر روزی یک
 * بار برای هر سالن). مسیر پیامک ندارد، بنابراین چرخهٔ صف را نمی‌شکند.
 */
async function notifySmsLimit(salonId: string, message: string, recipient: string) {
  try {
    const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { ownerId: true } });
    if (!salon?.ownerId) return;
    const day = new Date().toISOString().slice(0, 10);
    await enqueueInApp({
      type: "SMS_LIMIT_REACHED",
      userId: salon.ownerId,
      salonId,
      message: `${message} (درخواست ارسال به ${recipient} ثبت نشد)`,
      uniqueKey: `sms-limit:${salonId}:${day}`,
    });
  } catch {
    /* اعلان جانبی؛ نباید صف را با شکست دهد */
  }
}

/** قرار دادن ایمیل در صف (با حذف تکراری) */
export async function enqueueEmail(params: {
  type: string;
  recipient: string;
  subject: string;
  html: string;
  uniqueKey?: string;
}) {
  if (params.uniqueKey) {
    const existing = await prisma.notification.findUnique({
      where: { uniqueKey: params.uniqueKey },
      select: { status: true },
    });
    if (existing && existing.status !== "FAILED") return;
  }

  await prisma.notification.create({
    data: {
      type: params.type,
      channel: "EMAIL",
      recipient: params.recipient,
      payload: { subject: params.subject, html: params.html },
      uniqueKey: params.uniqueKey,
      status: "PENDING",
      nextAttemptAt: new Date(),
    },
  });
}

/** پردازش اعلان‌های در انتظار (SMS + ایمیل) با تلاش مجدد */
/** ثبت اعلان داخل برنامه‌ای برای یک کاربر (بدون ارسال SMS/ایمیل) */
export async function enqueueInApp(params: {
  type: string;
  userId: string;
  message: string;
  uniqueKey?: string;
  /** سالن مربوط (برای اعلان‌های سطح سالن مثل پر شدن سقف پیامک) */
  salonId?: string | null;
}) {
  if (params.uniqueKey) {
    const existing = await prisma.notification.findUnique({
      where: { uniqueKey: params.uniqueKey },
      select: { status: true },
    });
    if (existing && existing.status !== "FAILED") return;
  }

  await prisma.notification.create({
    data: {
      type: params.type,
      channel: "IN_APP",
      recipient: params.userId,
      userId: params.userId,
      salonId: params.salonId ?? undefined,
      payload: { message: params.message },
      uniqueKey: params.uniqueKey,
      status: "SENT",
      sentAt: new Date(),
      nextAttemptAt: new Date(),
    },
  });
}

export async function processPendingNotifications(limit = 50) {
  const pending = await prisma.notification.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  const emailSender = await getEmailSender();
  let sent = 0;
  let failed = 0;

  for (const n of pending) {
    if (n.attempts >= MAX_ATTEMPTS) {
      await prisma.notification.update({ where: { id: n.id }, data: { status: "DROPPED" } });
      continue;
    }
    try {
      if (n.channel === "EMAIL") {
        const { subject, html } = (n.payload as { subject?: string; html?: string } | null) ?? {};
        await emailSender.sendEmail(n.recipient, subject ?? "نوبینو", html ?? "");
      } else {
        const message = (n.payload as { message?: string } | null)?.message ?? "";
        // ارسال با fallback بین سرویس‌های پیامک
        await sendSmsWithFallback(n.recipient, message);
      }
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: "SENT", sentAt: new Date() },
      });
      sent++;
    } catch (e) {
      failed++;
      const attempts = n.attempts + 1;
      const backoffMs = 60_000 * Math.pow(2, attempts - 1);
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          attempts,
          lastError: e instanceof Error ? e.message.slice(0, 300) : String(e),
          nextAttemptAt: new Date(Date.now() + backoffMs),
        },
      });
    }
  }

  return { processed: pending.length, sent, failed };
}
