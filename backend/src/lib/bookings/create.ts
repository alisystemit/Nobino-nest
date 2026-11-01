import { prisma } from "@/lib/prisma";
import type { CreationChannel, Prisma } from "@prisma/client";
import { assertBookableWindow } from "@/lib/bookings/availability";
import { serviceDuration } from "@/lib/bookings/service";

/**
 * ثبت نوبت با حفظ قطعیت در برابر رزرو هم‌زمان.
 *
 * نحوه محافظت:
 * ۱) در یک تراکنش، ردیف «سالن» قفل می‌شود (SELECT ... FOR UPDATE)
 *     تا همه درخواست‌های نوبت همان سالن سری‌سازی شوند.
 * ۲) سپس اعتبار بازه (ساعات کاری/تعطیلی) و تداخل با نوبت‌های موجود (و بافر) بررسی می‌شود.
 * ۳) اگر مشکلی نبود، نوبت درج می‌شود.
 */

export class BookingConflictError extends Error {
  status = 409;
  constructor(message = "این بازه زمانی در حال حاضر قابل رزرو نیست") {
    super(message);
  }
}

export async function createAppointmentSafe(input: {
  salonId: string;
  serviceId?: string;
  employeeId?: string;
  branchId?: string;
  customerName: string;
  customerPhone: string;
  startAt: Date;
  durationMin: number;
  /** بافر محاسبه‌شده برای رزرو چندخدمتی؛ اگر ارسال نشود از خدمت/سالن خوانده می‌شود. */
  bufferMin?: number;
  channel: CreationChannel;
  note?: string;
  customerId?: string;
  voiceCallId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    // قفل سالن برای سری‌سازی رزروها
    await tx.$queryRaw`SELECT id FROM "Salon" WHERE id = ${input.salonId}::text FOR UPDATE`;

    const salon = await tx.salon.findUnique({ where: { id: input.salonId } });
    if (!salon) throw new Error("salon not found");

    // per-service buffer takes precedence over salon default
    const service = input.serviceId ? await tx.service.findUnique({ where: { id: input.serviceId } }) : null;

    const start = new Date(input.startAt);
    const duration = input.durationMin ?? (service ? serviceDuration(service) : 60);
    const buffer =
      input.bufferMin !== undefined && input.bufferMin >= 0
        ? input.bufferMin
        : service?.bufferMin && service.bufferMin > 0
          ? service.bufferMin
          : salon.bufferMinutes;
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const serviceEnd = new Date(end.getTime() + buffer * 60 * 1000);
    const now = new Date();

    // قوانین: حداقل فاصله تا رزرو
    if (start.getTime() < now.getTime() + salon.minNoticeMinutes * 60 * 1000) {
      throw new BookingConflictError("رزرو بسیار نزدیک به زمان حال است.");
    }
    // حداکثر بازه آینده
    if (start.getTime() > now.getTime() + salon.maxAdvanceDays * 86400 * 1000) {
      throw new BookingConflictError("این تاریخ خارج از بازه مجاز رزرو است.");
    }
    // داخل ساعات کاری و روز غیرتعطیل
    await assertBookableWindow({
      salon,
      start,
      end,
      employeeId: input.employeeId,
      branchId: input.branchId,
    });

    // تداخل با نوبت‌های موجود (پوشش بافر)
    const clashWhere: Prisma.AppointmentWhereInput = {
      salonId: salon.id,
      status: { in: ["REQUESTED", "CONFIRMED"] },
      startAt: { lt: serviceEnd },
      endAt: { gt: new Date(start.getTime() - buffer * 60 * 1000) },
      AND: [
        // هر کارمند فقط با نوبت‌های خودش یا نوبت‌های بدون کارمند تداخل دارد
        ...(input.employeeId ? [{ OR: [{ employeeId: input.employeeId }, { employeeId: null }] }] : []),
        // همان منطق برای شعبه
        ...(input.branchId ? [{ OR: [{ branchId: input.branchId }, { branchId: null }] }] : []),
        // قفل‌های موقت منقضی‌شده ظرفیت را اشغال نمی‌کنند
        { OR: [{ tempLockExpiresAt: null }, { tempLockExpiresAt: { gt: now } }] },
      ],
    };
    const existingAppts = await tx.appointment.findMany({ where: clashWhere });
    const candidateEffectiveEnd = serviceEnd;
    const clash = existingAppts.find((a) => {
      const existingEffectiveEnd = new Date(a.endAt.getTime() + buffer * 60 * 1000);
      return start < existingEffectiveEnd && candidateEffectiveEnd > a.startAt;
    });
    if (clash) throw new BookingConflictError();

    // تداخل با بازه‌های مسدود
    const blockWhere: Prisma.TimeBlockWhereInput = {
      salonId: salon.id,
      startAt: { lt: serviceEnd },
      endAt: { gt: start },
      AND: [
        ...(input.employeeId ? [{ OR: [{ staffId: input.employeeId }, { staffId: null }] }] : []),
        ...(input.branchId ? [{ OR: [{ branchId: input.branchId }, { branchId: null }] }] : []),
      ],
    };
    const blockClash = await tx.timeBlock.findFirst({ where: blockWhere });
    if (blockClash) throw new BookingConflictError("این بازه زمانی مسدود شده است.");

    // درج نوبت
    return tx.appointment.create({
      data: {
        salonId: salon.id,
        serviceId: input.serviceId,
        employeeId: input.employeeId,
        branchId: input.branchId,
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        startAt: start,
        endAt: end,
        channel: input.channel,
        note: input.note,
        voiceCallId: input.voiceCallId,
        status: "REQUESTED",
      },
    });
  });
}
