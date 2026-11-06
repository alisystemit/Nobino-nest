// خودکار: پورت‌شده از src/app/api/appointments/hold/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { asNumber } from "@/lib/money";
import { createAppointmentSafe, depositForSalon } from "@/lib/bookings/create";
import { json, apiError } from "@/lib/utils";
import { checkRate, clientIpFromRequest, numericSettingOrEnv, tooManyRequests } from "@/lib/rate-limit-lite";
import { HOLD_MARKER } from "@/lib/markers";

const HOLD_MINUTES = 15;

const schema = z.object({
  salonId: z.string(),
  serviceId: z.string().optional(),
  employeeId: z.string().optional(),
  branchId: z.string().optional(),
  startAt: z.string().datetime(),
  durationMin: z.number().int().min(5).max(480).optional(),
});

/** قفل موقت بازه هنگام پرداخت/تأیید (ضد رزرو هم‌زمان در لحظه خرید) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());

    const salon = await prisma.salon.findUnique({ where: { id: body.salonId } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    // C6: این مسیر کاملاً ناشناس است؛ فقط سالن فعال و تأییدشده اجازهٔ قفل بازه دارد.
    if (!salon.isActive || !salon.isApproved) {
      return json({ success: false, error: "این سالن در حال حاضر امکان دریافت نوبت ندارد." }, { status: 404 });
    }

    // مهار ربات: سقف نرخ به ازای هر IP + سقف هولوهای فعال یک سالن
    const ip = clientIpFromRequest(req);
    const perMinute = await numericSettingOrEnv("hold.rate_per_minute", process.env.HOLD_RATE_PER_MINUTE, 6);
    if (perMinute > 0) {
      const rate = checkRate(`hold:${ip}:${salon.id}`, perMinute, 60_000);
      if (!rate.ok) return tooManyRequests(rate.retryAfterSec, "درخواست رزرو زیادی از این IP؛ کمی صبر کنید.");
    }
    const maxHolds = await numericSettingOrEnv("hold.max_active_per_salon", process.env.HOLD_MAX_ACTIVE_PER_SALON, 30);
    if (maxHolds > 0) {
      const activeHolds = await prisma.appointment.count({
        where: { salonId: salon.id, note: HOLD_MARKER, tempLockExpiresAt: { gt: new Date() } },
      });
      if (activeHolds >= maxHolds) {
        return json({ success: false, error: "تعداد رزروهای در انتظار پرداخت به سقف رسیده است؛ چند دقیقه صبر کنید." }, { status: 429 });
      }
    }

    let duration = body.durationMin;
    let servicePrice = 0;
    if (body.serviceId) {
      // مدت خدمت همیشه از دیتابیس خوانده می‌شود و باید متعلق به همین سالن باشد
      const svc = await prisma.service.findFirst({ where: { id: body.serviceId, salonId: salon.id, isActive: true } });
      if (!svc) return json({ success: false, error: "خدمت یافت نشد" }, { status: 404 });
      duration = svc.durationMin;
      servicePrice = asNumber(svc.price);
    }
    if (duration === undefined) {
      return json({ success: false, error: "بدون انتخاب خدمت، مدت نوبت (5 تا 480 دقیقه) الزامی است." }, { status: 400 });
    }

    // کارمند باید متعلق به همین سالن و فعال باشد و خدمت انتخابی را ارائه دهد
    if (body.employeeId) {
      const staff = await prisma.staff.findUnique({
        where: { id: body.employeeId },
        select: { salonId: true, isActive: true, services: { select: { id: true } } },
      });
      if (!staff || staff.salonId !== salon.id || !staff.isActive) {
        return json({ success: false, error: "آرایشگر یافت نشد" }, { status: 400 });
      }
      if (body.serviceId) {
        const offered = staff.services.map((s) => s.id);
        if (offered.length > 0 && !offered.includes(body.serviceId)) {
          return json({ success: false, error: "این آرایشگر خدمت انتخابی را ارائه نمی‌دهد" }, { status: 400 });
        }
      }
    }

    if (body.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: body.branchId }, select: { salonId: true } });
      if (!branch || branch.salonId !== salon.id) {
        return json({ success: false, error: "شعبه یافت نشد" }, { status: 400 });
      }
    }

    // C7: بیعانه از همان لحظهٔ قفل بازه روی نوبت می‌نشیند تا مبلغی که
    // مشتری درگاه می‌بیند با بیعانهٔ ثبت‌شده یکی باشد.
    const depositAmount = depositForSalon(salon, servicePrice);

    const appointment = await createAppointmentSafe({
      salonId: salon.id,
      serviceId: body.serviceId,
      employeeId: body.employeeId,
      branchId: body.branchId,
      customerName: "در انتظار پرداخت",
      customerPhone: "0000000000",
      startAt: new Date(body.startAt),
      durationMin: duration,
      channel: "WEBAPP",
      note: HOLD_MARKER,
      depositAmount,
      // O9: هولد هم قیمت لحظه را قفل می‌کند تا بعد از confirm، درآمد همین عدد باشد
      priceSnapshot: body.serviceId ? servicePrice : null,
    });

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
    const held = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { tempLockExpiresAt: expiresAt },
    });

    return json({ success: true, holdId: held.id, expiresAt, depositAmount: held.depositAmount }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
