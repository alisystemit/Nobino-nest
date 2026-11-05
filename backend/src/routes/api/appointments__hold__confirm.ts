// خودکار: پورت‌شده از src/app/api/appointments/hold/confirm/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { enqueueSms } from "@/lib/notifications/queue";
import { dispatchWebhook } from "@/lib/webhooks";
import { json, apiError, httpError } from "@/lib/utils";
import { checkRate, clientIpFromRequest, numericSettingOrEnv, tooManyRequests } from "@/lib/rate-limit-lite";
import { HOLD_MARKER } from "@/lib/markers";

const schema = z.object({
  appointmentId: z.string(),
  customerName: z.string().min(1).max(80),
  customerPhone: z.string().regex(/^0?9\d{9}$/),
});

/** تبدیل قفل موقت به نوبت قطعی (پس از پرداخت/تأیید مشتری) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());
    const phone = body.customerPhone.startsWith("0") ? body.customerPhone : `0${body.customerPhone}`;

    // مهار ربات: این مسیر هم ناشناس است و پیش‌تر هیچ محدودیت نرخ نداشت
    const perMinute = await numericSettingOrEnv("hold.confirm_rate_per_minute", process.env.HOLD_CONFIRM_RATE_PER_MINUTE, 8);
    if (perMinute > 0) {
      const rate = checkRate(`hold:confirm:${clientIpFromRequest(req)}`, perMinute, 60_000);
      if (!rate.ok) return tooManyRequests(rate.retryAfterSec, "تأیید نوبت زیادی از این دستگاه انجام شده است؛ کمی صبر کنید.");
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: body.appointmentId },
      include: { salon: { select: { name: true, id: true, timezone: true } } },
    });
    if (!appointment) return json({ success: false, error: "نوبت یافت نشد" }, { status: 404 });
    // فقط نوبت‌هایی که واقعاً قفل موقت (hold) هستند قابل تأییدند؛ در غیر این صورت
    // هر شناسهٔ نوبت دیگری نمی‌تواند به نام شخص دیگری ثبت شود.
    if (appointment.note !== HOLD_MARKER) {
      return json({ success: false, error: "این نوبت قفل موقت نیست" }, { status: 409 });
    }
    if (!appointment.tempLockExpiresAt || appointment.tempLockExpiresAt < new Date()) {
      return json({ success: false, error: "قفل موقت منقضی شده است؛ دوباره تلاش کنید" }, { status: 410 });
    }

    // به‌روزرسانی مشروط: اگر هم‌زمان انقضا یا لغو شده، تعداد رکوردهای تغییر‌یافته صفر است
    const confirmed = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointment.id,
          note: HOLD_MARKER,
          tempLockExpiresAt: { gt: new Date() },
        },
        data: { customerName: body.customerName, customerPhone: phone, tempLockExpiresAt: null, note: null, status: "REQUESTED" },
      });
      if (updated.count !== 1) {
        throw httpError("قفل موقت منقضی شده است؛ دوباره تلاش کنید", 410);
      }
      return tx.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    });

    const time = new Intl.DateTimeFormat("fa-IR", { timeStyle: "short", timeZone: appointment.salon.timezone }).format(confirmed.startAt);
    await enqueueSms({
      type: "APPOINTMENT_CONFIRM",
      recipient: phone,
      message: `نوبت شما در «${appointment.salon.name}» برای ساعت ${time} ثبت شد. (تأیید: ${confirmed.id.slice(0, 8)})`,
      uniqueKey: `confirm:${confirmed.id}`,
      salonId: appointment.salonId,
    });
    await dispatchWebhook(appointment.salonId, "appointment.confirmed", { appointmentId: confirmed.id, customerName: body.customerName, startAt: confirmed.startAt });

    return json({ success: true, appointment: confirmed });
  } catch (err) {
    return apiError(err);
  }
}
