// خودکار: پورت‌شده از src/app/api/appointments/route.ts — بدون تغییر منطق


import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { json, apiError, getPagination } from "@/lib/utils";
import { checkRate, clientIpFromRequest, numericSettingOrEnv, tooManyRequests } from "@/lib/rate-limit-lite";
import { createAppointmentSafe, depositForSalon } from "@/lib/bookings/create";
import { combinedBooking } from "@/lib/bookings/service";
import { localMidnightUTC } from "@/lib/timezone";
import { enqueueInApp, enqueueSms, processPendingNotifications } from "@/lib/notifications/queue";
import { renderSmsTemplate } from "@/lib/notifications/templates";

/** فهرست نوبت‌های سالنِ آرایشگر (یا همه برای ادمین) */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();

    let where: Prisma.AppointmentWhereInput = { id: "" };
    let timezone = "Asia/Tehran";
    if (user.role === "SALON_OWNER") {
      const salon = await prisma.salon.findFirst({
        where: { ownerId: user.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, timezone: true },
      });
      where = salon ? { salonId: salon.id } : { id: "" };
      if (salon?.timezone) timezone = salon.timezone;
    } else if (user.role === "AGENT") {
      const plans = await prisma.commissionPlan.findMany({ where: { agentId: user.id, isActive: true }, select: { salonId: true } });
      const salonIds = plans.map((p) => p.salonId);
      where = salonIds.length ? { salonId: { in: salonIds } } : { id: "" };
    } else if (user.role === "CUSTOMER") {
      // نوبت‌های مهمان (بدون حساب) با همان شمارهٔ تلفن هم دیده می‌شوند؛
      // ورود با OTP مالکیت شماره را اثبات می‌کند و route لغو هم همین قاعده را دارد.
      where = { OR: [{ customerId: user.id }, ...(user.phone ? [{ customerPhone: user.phone }] : [])] };
    } else if (user.role === "ADMIN") {
      where = {};
    }

    // بازه زمانی اختیاری برای تقویم (روز/هفته/ماه)
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (from || to) {
      const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      const start = from
        ? isDay(from)
          ? localMidnightUTC(from, timezone)
          : new Date(from)
        : undefined;
      let end: Date | undefined;
      if (to) {
        if (isDay(to)) {
          const d = new Date(`${to}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          end = localMidnightUTC(d.toISOString().slice(0, 10), timezone);
        } else {
          end = new Date(to);
        }
      }
      where.startAt = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lt: end } : {}),
      };
    }

    // صفحه‌بندی: بازهٔ تقویمی (from/to) لیست کامل پنجره را می‌خواهد؛ فهرست ساده صفحه‌صفحه می‌شود
    const { page, limit, skip, take } = getPagination(req.url, from || to ? 2000 : 25, 2000);

    const [rows, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          service: { select: { id: true, name: true, price: true } },
          salon: { select: { id: true, name: true, slug: true, timezone: true } },
          employee: { select: { id: true, name: true } },
        },
        orderBy: from || to ? [{ startAt: "asc" as const }, { id: "asc" as const }] : [{ startAt: "desc" as const }, { id: "asc" as const }],
        skip,
        take,
      }),
      prisma.appointment.count({ where }),
    ]);
    const appointments = rows;

    return json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      appointments: appointments.map((a) => ({
        id: a.id,
        customerName: a.customerName,
        customerPhone: a.customerPhone,
        startAt: a.startAt,
        endAt: a.endAt,
        status: a.status,
        channel: a.channel,
        service: a.service?.name,
        serviceId: a.service?.id,
        // O9: قیمت لحظهٔ رزرو اگر ثبت شده همان مبنای گزارش است؛ برای ردیف‌های
        // قدیمی (snapshot ندارد) قیمت جاری خدمت نشان داده می‌شود.
        servicePrice: a.priceSnapshot ?? a.service?.price,
        priceSnapshot: a.priceSnapshot,
        salonId: a.salon?.id,
        salonName: a.salon?.name,
        salonSlug: a.salon?.slug,
        salonTimezone: a.salon?.timezone,
        employee: a.employee?.name,
        employeeId: a.employee?.id,
        branchId: a.branchId,
        note: a.note,
        depositAmount: a.depositAmount,
        depositPaid: a.depositPaid,
      })),
    });
  } catch (err) {
    return apiError(err);
  }
}

const schema = z.object({
  salonId: z.string(),
  serviceId: z.string().optional(),
  serviceIds: z.array(z.string()).max(8).optional(), // رزرو چند خدمت
  employeeId: z.string().optional(),
  branchId: z.string().optional(),
  // C10: متن‌های بدون سقف، چیدمان داشبورد و پیامک تأیید را می‌شکستند و هزینهٔ SMS داشتند
  customerName: z.string().trim().min(1).max(60),
  // اصلاح: دقیقاً 11 رقم با 09 (نیاز به نرمالایز قبل از validation)
  customerPhone: z.string().refine(
    (phone) => /^[09]\d{9}$/.test(phone.replace(/^0+/, "0")),
    { message: "شماره موبایل باید دقیقاً ۱۱ رقم باشد (با 09 شروع شود)" }
  ),
  startAt: z.string().datetime(), // ISO
  // O14: فقط وقتی خدمتی انتخاب نشده معتبر است؛ با خدمت، مدت از خود خدمت خوانده می‌شود
  durationMin: z.number().int().min(5).max(480).optional(),
  channel: z.enum(["VOICE", "MANUAL", "WEBAPP"]).default("MANUAL"),
  voiceCallId: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

// اصلاح: Rate limit باید قبل از DB query باشد
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());
    const user = await requireAuth().catch(() => null);

    // C8: مهار ربات روی مسیر ایجاد نوبت (فقط رزرو مشتری؛ ثبت نوبت توسط مدیر سالن یا سوپرادمین مهار نمی‌شود)
    // اصلاح: rate limit را قبل از DB query اجرا می‌کنیم
    const isManagerOfThisSalon = !!user && (user.role === "ADMIN" || (user.role === "SALON_OWNER" && user.role === "STAFF" && user.salonId === body.salonId));
    if (!isManagerOfThisSalon) {
      const ip = clientIpFromRequest(req);
      const perIp = await numericSettingOrEnv("booking.rate_per_hour", process.env.BOOKING_RATE_PER_HOUR, 10);
      if (perIp > 0) {
        const rate = checkRate(`booking:ip:${ip}`, perIp, 60 * 60 * 1000);
        if (!rate.ok) return tooManyRequests(rate.retryAfterSec, "درخواست نوبت زیادی از این دستگاه ثبت شده است؛ کمی بعد دوباره تلاش کنید.");
      }
      const perPhone = await numericSettingOrEnv("booking.rate_per_phone", process.env.BOOKING_RATE_PER_PHONE, 6);
      if (perPhone > 0) {
        const rate = checkRate(`booking:phone:${body.customerPhone}`, perPhone, 60 * 60 * 1000);
        if (!rate.ok) return tooManyRequests(rate.retryAfterSec, "برای این شماره بیش از حد مجاز نوبت ثبت شده است.");
      }
    }

    // DB query بعد از rate limit
    const salon = await prisma.salon.findUnique({ where: { id: body.salonId } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    // C6: سالن غیرفعال یا تأییدنشده نوبت مشتری نمی‌گیرد.
    // استثنا: خودِ مالک سالن و سوپرادمین (رزرو دستی/صوتی از پنل پیش از تأیید هم کار می‌کند).
    if (!isManagerOfThisSalon && (!salon.isActive || !salon.isApproved)) {
      return json({ success: false, error: "این سالن در حال حاضر امکان دریافت نوبت ندارد." }, { status: 404 });
    }

    // دیگر چک‌ها...

    // خدمات انتخاب‌شده (تک‌خدمتی یا چندخدمتی) — همیشه از دیتابیس خوانده می‌شوند
    const requestedIds = Array.from(
      new Set(
        body.serviceIds && body.serviceIds.length > 0
          ? body.serviceIds
          : body.serviceId
            ? [body.serviceId]
            : []
      )
    );
    const selectedServices = requestedIds.length
      ? await prisma.service.findMany({
          where: { id: { in: requestedIds }, salonId: salon.id, isActive: true },
        })
      : [];
    if (selectedServices.length !== requestedIds.length) {
      return json({ success: false, error: "یکی از خدمت‌ها یافت نشد یا غیرفعال است" }, { status: 404 });
    }

    const primaryServiceId = selectedServices[0]?.id;
    let duration = body.durationMin ?? 60;
    let buffer: number | undefined;
    let totalPrice = 0;
    let combinedNote = body.note;
    if (selectedServices.length > 0) {
      const totals = combinedBooking(selectedServices);
      duration = totals.durationMin;
      totalPrice = totals.price;
      buffer = totals.bufferMin > 0 ? totals.bufferMin : salon.bufferMinutes;
      if (selectedServices.length > 1) {
        combinedNote = [body.note, selectedServices.map((s) => s.name).join("، ")]
          .filter(Boolean)
          .join(" — ");
      }
    } else {
      // نوبت بدون خدمت (مثلاً مراجعه سرخود): مدت باید منطقی باشد
      const raw = body.durationMin ?? 60;
      if (raw < 5 || raw > 480) {
        return json({ success: false, error: "مدت نوبت باید بین 5 تا 480 دقیقه باشد" }, { status: 400 });
      }
      duration = raw;
    }

    // اعتبارسنجی تعلق کارمند و شعبه به همین سالن (جلوگیری از ثبت متقاطع)
    if (body.employeeId) {
      const staff = await prisma.staff.findUnique({
        where: { id: body.employeeId },
        select: { salonId: true, isActive: true, services: { select: { id: true } } },
      });
      if (!staff || staff.salonId !== salon.id || !staff.isActive) {
        return json({ success: false, error: "آرایشگر یافت نشد" }, { status: 400 });
      }
      // اگر برای آرایشگر خدمات مشخصی تعریف شده، فقط همان‌ها قابل ارائه‌اند
      const offered = staff.services.map((s) => s.id);
      if (offered.length > 0 && requestedIds.some((id) => !offered.includes(id))) {
        return json(
          { success: false, error: "این آرایشگر همه خدمات انتخاب‌شده را ارائه نمی‌دهد" },
          { status: 400 }
        );
      }
    }
    if (body.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: body.branchId }, select: { salonId: true } });
      if (!branch || branch.salonId !== salon.id) {
        return json({ success: false, error: "شعبه یافت نشد" }, { status: 400 });
      }
    }

    // مدیر همان سالن نمی‌تواند از راه عمومی (مینی‌اپ/صفحهٔ سالن، channel=WEBAPP) نوبت بگیرد؛
    // نوبت‌های او باید از پنل ثبت شود: دستی (MANUAL) یا هوشمند/صوتی (VOICE).
    if (user && user.role === "SALON_OWNER" && body.channel === "WEBAPP" && salon.ownerId === user.id) {
      return json(
        {
          success: false,
          error:
            "مدیر همان سالن نمی‌تواند به‌عنوان مشتری نوبت بگیرد. نوبت خود را با «رزرو دستی» یا «رزرو هوشمند» در پنل ثبت کنید.",
        },
        { status: 403 }
      );
    }

    // بیعانه فقط برای رزروِ مشتری (با حساب یا مهمان) محاسبه می‌شود؛
    // وقتی سالن‌دار از پنل خودش رزرو می‌کند، بیعانه در محل دریافت می‌شود.
    const depositAmount = user === null || user.role === "CUSTOMER" ? depositForSalon(salon, totalPrice) : null;

    // ثبت نوبت با محافظت از رزرو هم‌زمان (تراکنش + قفل)
    const appointment = await createAppointmentSafe({
      salonId: salon.id,
      serviceId: primaryServiceId,
      employeeId: body.employeeId,
      branchId: body.branchId,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      startAt: new Date(body.startAt),
      durationMin: duration,
      bufferMin: buffer,
      channel: body.channel,
      voiceCallId: body.voiceCallId,
      note: combinedNote,
      customerId: user?.id ?? undefined,
      depositAmount,
      // O9: مبنای درآمد همین‌جا فریز می‌شود (مجموع خدمات انتخاب‌شده، نه فقط خدمت اول)
      priceSnapshot: selectedServices.length > 0 ? totalPrice : null,
    });

    // ارسال پیامک تأیید از طریق صف (با حذف تکراری و تلاش مجدد)
    const time = new Intl.DateTimeFormat("fa-IR", { timeStyle: "short", timeZone: salon.timezone }).format(appointment.startAt);
    let confirmMsg = await renderSmsTemplate("sms.template.confirm", {
      salon: salon.name,
      customer: body.customerName,
      time,
      date: appointment.startAt.toLocaleDateString("fa-IR", { timeZone: salon.timezone }),
      code: appointment.id.slice(0, 8),
    });
    if (depositAmount && depositAmount > 0) {
      confirmMsg += ` بیعانه نوبت ${depositAmount} تومان است و باید پیش از زمان نوبت پرداخت شود.`;
    }
    await enqueueSms({
      type: "APPOINTMENT_CONFIRM",
      recipient: body.customerPhone,
      message: confirmMsg,
      uniqueKey: `confirm:${appointment.id}`,
      salonId: appointment.salonId,
    });
    if (user?.id) {
      await enqueueInApp({
        type: "APPOINTMENT_CONFIRM",
        userId: user.id,
        message: `نوبت شما در «${salon.name}» برای ${appointment.startAt.toLocaleDateString("fa-IR", {
          timeZone: salon.timezone,
        })} ساعت ${time} ثبت شد.`,
        uniqueKey: `inapp-confirm:${appointment.id}`,
      }).catch(() => {});
    }
    await processPendingNotifications(5).catch(() => {});

    return json(
      {
        success: true,
        appointment,
        // O14: مدت و بافر و بیعانهٔ «اعمال‌شده» اعلام می‌شوند تا پاسخ متضاد نباشد؛
        // اگر درخواست durationMin فرستاده باشد ولی خدمت دیگری تعیین کرده باشد،
        // همین‌جا مقدار واقعی را می‌بیند (پیش‌تر 900 دقیقه با خدمت 40 دقیقه‌ای 201 می‌داد).
        applied: {
          durationMin: duration,
          bufferMin: buffer ?? salon.bufferMinutes,
          price: totalPrice,
          depositAmount,
          ignoredDurationMin: selectedServices.length > 0 && body.durationMin !== undefined && body.durationMin !== duration ? body.durationMin : undefined,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return apiError(err);
  }
}

