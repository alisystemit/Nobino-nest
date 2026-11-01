import { prisma } from "@/lib/prisma";
import { assertBookableWindow } from "@/lib/bookings/availability";
import type { Prisma } from "@prisma/client";

export class RescheduleConflictError extends Error {
  status = 409;
  constructor(message = "بازه جدید قابل رزرو نیست") {
    super(message);
  }
}

/** جابه‌جایی نوبت با محافظت از تداخل (تراکنش + قفل سالن) */
export async function rescheduleAppointmentSafe(
  appointmentId: string,
  newStartAt: Date,
  options?: { enforceCancelDeadline?: boolean }
) {
  return prisma.$transaction(async (tx) => {
    const prev = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: { salon: true, service: { select: { bufferMin: true } } },
    });
    if (!prev) throw new Error("نوبت یافت نشد");

    await tx.$queryRaw`SELECT id FROM "Salon" WHERE id = ${prev.salonId}::text FOR UPDATE`;

    // مهلت تغییر زمان برای مشتری (مالک سالن/ادمین معاف)
    if (options?.enforceCancelDeadline) {
      const deadline = new Date(prev.startAt.getTime() - prev.salon.cancelDeadlineHours * 3600 * 1000);
      if (new Date() > deadline) {
        throw new RescheduleConflictError("مهلت تغییر یا لغو این نوبت گذشته است.");
      }
    }

    const duration = (prev.endAt.getTime() - prev.startAt.getTime()) / 60000;
    const serviceBuf = prev.service?.bufferMin && prev.service.bufferMin > 0 ? prev.service.bufferMin : 0;
    const buffer = serviceBuf || prev.salon.bufferMinutes;
    const start = new Date(newStartAt);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const serviceEnd = new Date(end.getTime() + buffer * 60 * 1000);
    const now = new Date();

    // حداقل فاصله تا رزرو / حداکثر بازه آینده
    if (start.getTime() < now.getTime() + prev.salon.minNoticeMinutes * 60 * 1000) {
      throw new RescheduleConflictError("زمان جدید بسیار نزدیک به زمان حال است.");
    }
    if (start.getTime() > now.getTime() + prev.salon.maxAdvanceDays * 86400 * 1000) {
      throw new RescheduleConflictError("این تاریخ خارج از بازه مجاز رزرو است.");
    }

    // داخل ساعات کاری و روز غیرتعطیل
    await assertBookableWindow({
      salon: prev.salon,
      start,
      end,
      employeeId: prev.employeeId ?? undefined,
      branchId: prev.branchId ?? undefined,
    });

    // تداخل با نوبت‌های دیگر (پوشش بافر)
    const clashWhere: Prisma.AppointmentWhereInput = {
      salonId: prev.salonId,
      status: { in: ["REQUESTED", "CONFIRMED"] },
      startAt: { lt: serviceEnd },
      endAt: { gt: new Date(start.getTime() - buffer * 60 * 1000) },
      id: { not: appointmentId },
      AND: [
        ...(prev.employeeId ? [{ OR: [{ employeeId: prev.employeeId }, { employeeId: null }] }] : []),
        ...(prev.branchId ? [{ OR: [{ branchId: prev.branchId }, { branchId: null }] }] : []),
        { OR: [{ tempLockExpiresAt: null }, { tempLockExpiresAt: { gt: now } }] },
      ],
    };

    const existing = await tx.appointment.findMany({ where: clashWhere });
    const clash = existing.find((a) => {
      const existingEffectiveEnd = new Date(a.endAt.getTime() + buffer * 60 * 1000);
      return start < existingEffectiveEnd && serviceEnd > a.startAt;
    });
    if (clash) throw new RescheduleConflictError();

    // تداخل با بازه‌های مسدود (TimeBlock)
    const blockWhere: Prisma.TimeBlockWhereInput = {
      salonId: prev.salonId,
      startAt: { lt: serviceEnd },
      endAt: { gt: start },
      AND: [
        ...(prev.employeeId ? [{ OR: [{ staffId: prev.employeeId }, { staffId: null }] }] : []),
        ...(prev.branchId ? [{ OR: [{ branchId: prev.branchId }, { branchId: null }] }] : []),
      ],
    };
    const blockClash = await tx.timeBlock.findFirst({ where: blockWhere });
    if (blockClash) throw new RescheduleConflictError("این بازه زمانی مسدود شده است.");

    return tx.appointment.update({
      where: { id: appointmentId },
      data: { startAt: start, endAt: end },
    });
  });
}
