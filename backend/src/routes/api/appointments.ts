// خودکار: پورت‌شده از src/app/api/appointments/route.ts — بدون تغییر منطق


import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";
import { createAppointmentSafe } from "@/lib/bookings/create";
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
      where = { customerId: user.id };
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

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, price: true } },
        salon: { select: { id: true, name: true, slug: true, timezone: true } },
        employee: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
      take: from || to ? 2000 : 200,
    });

    return json({
      success: true,
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
        servicePrice: a.service?.price,
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
  customerName: z.string().min(1),
  customerPhone: z.string().regex(/^0?9\d{9}$/),
  startAt: z.string().datetime(), // ISO
  durationMin: z.number().int().positive().optional(),
  channel: z.enum(["VOICE", "MANUAL", "WEBAPP"]).default("MANUAL"),
  voiceCallId: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());

    const salon = await prisma.salon.findUnique({ where: { id: body.salonId } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

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
    let combinedNote = body.note;
    if (selectedServices.length > 0) {
      const totals = combinedBooking(selectedServices);
      duration = totals.durationMin;
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
        return json({ success: false, error: "مدت نوبت باید بین ۵ تا ۴۸۰ دقیقه باشد" }, { status: 400 });
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

    const user = await requireAuth().catch(() => null);

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
    });

    // ارسال پیامک تأیید از طریق صف (با حذف تکراری و تلاش مجدد)
    const time = new Intl.DateTimeFormat("fa-IR", { timeStyle: "short", timeZone: salon.timezone }).format(appointment.startAt);
    const confirmMsg = await renderSmsTemplate("sms.template.confirm", {
      salon: salon.name,
      customer: body.customerName,
      time,
      date: appointment.startAt.toLocaleDateString("fa-IR", { timeZone: salon.timezone }),
      code: appointment.id.slice(0, 8),
    });
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

    return json({ success: true, appointment }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

