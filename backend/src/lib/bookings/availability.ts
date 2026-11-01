import { prisma } from "@/lib/prisma";
import { localMidnightUTC, localParts } from "@/lib/timezone";
import { combinedBooking, effectiveBuffer } from "@/lib/bookings/service";
import type { Salon, Service } from "@prisma/client";

export type Slot = { startAt: Date; endAt: Date };

const SLOT_STEP_MIN = 30;

export class BookingWindowError extends Error {
  status = 400;
}

/**
 * تبدیل روز هفته میلادی (JS: 0=یکشنبه) به قرارداد ذخیره‌سازی پروژه (0=شنبه).
 * UI ساعات کاری و صفحه عمومی سالن از همین قرارداد استفاده می‌کنند.
 */
function storedDayOfWeek(date: Date): number {
  return (date.getUTCDay() + 1) % 7;
}

export async function getSalonWindow(
  salonId: string,
  dayISO: string,
  branchId?: string
): Promise<{ open: number; close: number }> {
  // تعطیلات استثنایی (Holiday) — تعطیلی اختصاصی شعبه یا تعطیلی کل سالن
  const dayStart = new Date(dayISO + "T00:00:00Z");
  const dayEnd = new Date(dayISO + "T23:59:59.999Z");
  const holiday = await prisma.holiday.findFirst({
    where: {
      salonId,
      date: { gte: dayStart, lte: dayEnd },
      OR: branchId ? [{ branchId }, { branchId: null }] : [{ branchId: null }],
    },
  });
  if (holiday) {
    if (holiday.isClosed || !holiday.openTime || !holiday.closeTime) return { open: 0, close: 0 };
    const [oh, om] = holiday.openTime.split(":").map(Number);
    const [ch, cm] = holiday.closeTime.split(":").map(Number);
    return { open: oh * 60 + om, close: ch * 60 + cm };
  }

  const date = new Date(dayISO + "T00:00:00Z");
  const day = storedDayOfWeek(date); // 0=شنبه ... 6=جمعه (مطابق UI)
  const hour = await prisma.openingHour.findUnique({
    where: { salonId_dayOfWeek: { salonId, dayOfWeek: day } },
  });
  if (!hour || hour.isClosed) return { open: 0, close: 0 };
  const [oh, om] = hour.openTime.split(":").map(Number);
  const [ch, cm] = hour.closeTime.split(":").map(Number);
  return { open: oh * 60 + om, close: ch * 60 + cm };
}

/** پنجره کاری آرایشگر (اگر برنامه شخصی داشته باشد، وگرنه پنجره سالن) */
export async function getStaffWindow(salonId: string, staffId: string, dayISO: string, branchId?: string) {
  const salonWindow = await getSalonWindow(salonId, dayISO, branchId);
  const staff = await prisma.staff.findUnique({ where: { id: staffId } });
  const schedule = (staff?.schedule as { day: number; open: string; close: string; isClosed?: boolean }[] | null) ?? null;
  const day = storedDayOfWeek(new Date(dayISO + "T00:00:00Z"));
  const entry = schedule?.find((s) => s.day === day);
  if (!schedule || !entry) return salonWindow;
  if (entry.isClosed) return { open: 0, close: 0 };
  const [oh, om] = entry.open.split(":").map(Number);
  const [ch, cm] = entry.close.split(":").map(Number);
  return { open: oh * 60 + om, close: ch * 60 + cm };
}

/**
 * شرط «کارمند مشخص یا نوبت‌های بدون کارمند».
 * نوبت بدون کارمند یعنی کل ظرفیت سالن/شعبه را اشغال می‌کند.
 */
function employeeScope(employeeId?: string) {
  return employeeId ? [{ OR: [{ employeeId }, { employeeId: null }] }] : [];
}

/** شرط «شعبه مشخص یا رکورد بدون شعبه» — به‌صورت AND با بقیه شروط. */
function branchScope(branchId?: string) {
  return branchId ? [{ OR: [{ branchId }, { branchId: null }] }] : [];
}

/** قفل‌های موقتِ منقضی‌شده نباید ظرفیت را اشغال کنند. */
function activeHoldScope(now: Date) {
  return [{ OR: [{ tempLockExpiresAt: null }, { tempLockExpiresAt: { gt: now } }] }];
}

/** بازه‌های اشغال (نوبت‌ها) که با بازه روز هم‌پوشانی دارند. */
export async function getOccupiedIntervals(
  salonId: string,
  dayISO: string,
  employeeId?: string,
  branchId?: string,
  timeZone: string = "Asia/Tehran",
  now: Date = new Date()
) {
  const start = localMidnightUTC(dayISO, timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const rows = await prisma.appointment.findMany({
    where: {
      salonId,
      status: { in: ["REQUESTED", "CONFIRMED"] },
      startAt: { lt: end },
      endAt: { gt: start },
      AND: [...employeeScope(employeeId), ...branchScope(branchId), ...activeHoldScope(now)],
    },
    select: { startAt: true, endAt: true },
  });
  return rows.map((r) => ({ start: r.startAt, end: r.endAt }));
}

/** بازه‌های مسدود (TimeBlock) که با بازه روز هم‌پوشانی دارند. */
export async function getBlockedIntervals(
  salonId: string,
  dayISO: string,
  employeeId?: string,
  branchId?: string,
  timeZone: string = "Asia/Tehran"
) {
  const start = localMidnightUTC(dayISO, timeZone);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const employee = employeeId ? [{ OR: [{ staffId: employeeId }, { staffId: null }] }] : [];
  const rows = await prisma.timeBlock.findMany({
    where: {
      salonId,
      startAt: { lt: end },
      endAt: { gt: start },
      AND: [...employee, ...branchScope(branchId)],
    },
    select: { startAt: true, endAt: true },
  });
  return rows.map((r) => ({ start: r.startAt, end: r.endAt }));
}

function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }) {
  return a.start < b.end && a.end > b.start;
}

/**
 * اعتبارسنجی قطعیِ بازه در لحظه ثبت/جابه‌جایی:
 * باید در یک روز محلی باشد و داخل ساعات کاری (سالن/آرایشگر) قرار بگیرد و آن روز تعطیل نباشد.
 */
export async function assertBookableWindow(params: {
  salon: Pick<Salon, "id" | "timezone">;
  start: Date;
  end: Date;
  employeeId?: string;
  branchId?: string;
}) {
  const tz = params.salon.timezone || "Asia/Tehran";
  const startLocal = localParts(params.start, tz);
  const endLocal = localParts(params.end, tz);

  if (startLocal.dayISO !== endLocal.dayISO) {
    throw new BookingWindowError("نوبت نمی‌تواند از نیمه‌شب عبور کند.");
  }

  const win = params.employeeId
    ? await getStaffWindow(params.salon.id, params.employeeId, startLocal.dayISO, params.branchId)
    : await getSalonWindow(params.salon.id, startLocal.dayISO, params.branchId);

  if (win.close <= win.open) {
    throw new BookingWindowError("سالن در این تاریخ تعطیل است.");
  }
  // پایان با ثانیه را به بالا گرد می‌کنیم تا نوبتی که چند ثانیه بعد از بسته‌شدن تمام می‌شود رد شود
  const endMin = endLocal.minutes + (endLocal.second > 0 ? 1 : 0);
  if (startLocal.minutes < win.open || endMin > win.close) {
    throw new BookingWindowError("زمان انتخابی خارج از ساعات کاری سالن است.");
  }
}

/**
 * محاسبه بازه‌های واقعاً آزاد برای یک یا چند خدمت در یک روز.
 * - مجموع مدت خدمات + بافر مؤثر
 * - محدود به پنجره کاری (سالن + آرایشگر)
 * - حذف تداخل با نوبت‌ها و بازه‌های مسدود
 * - رعایت حداقل فاصله تا رزرو و حداکثر بازه آینده
 */
export async function computeFreeSlots(params: {
  salon: Salon;
  services: Service[];
  employeeId?: string;
  branchId?: string;
  dayISO: string;
  now?: Date;
}): Promise<Slot[]> {
  const now = params.now ?? new Date();
  const { salon, services } = params;
  if (services.length === 0) return [];
  const duration = combinedBooking(services).durationMin;
  const buffer = effectiveBuffer(services, salon.bufferMinutes);

  const win = params.employeeId
    ? await getStaffWindow(salon.id, params.employeeId, params.dayISO, params.branchId)
    : await getSalonWindow(salon.id, params.dayISO, params.branchId);

  // سالن/آرایشگر در این روز تعطیل است
  if (win.close <= win.open) return [];

  const tz = salon.timezone || "Asia/Tehran";
  const rawOccupied = await getOccupiedIntervals(salon.id, params.dayISO, params.employeeId, params.branchId, tz, now);
  const occupied = rawOccupied.map((o) => ({ start: o.start, end: new Date(o.end.getTime() + buffer * 60 * 1000) }));
  const blocked = await getBlockedIntervals(salon.id, params.dayISO, params.employeeId, params.branchId, tz);

  // حداکثر بازه رزرو آینده
  const maxAdvance = new Date(now.getTime() + salon.maxAdvanceDays * 24 * 60 * 60 * 1000);
  const minNotice = new Date(now.getTime() + salon.minNoticeMinutes * 60 * 1000);

  const dateStart = localMidnightUTC(params.dayISO, tz);
  const dayEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);

  const slots: Slot[] = [];
  for (let t = win.open; t + duration <= win.close; t += SLOT_STEP_MIN) {
    const start = new Date(dateStart.getTime() + t * 60 * 1000);
    const end = new Date(start.getTime() + duration * 60 * 1000);
    const serviceEnd = new Date(end.getTime() + buffer * 60 * 1000);

    if (start >= dayEnd) break;
    if (start < minNotice) continue;
    if (start > maxAdvance) continue;

    const candidate = { start, end: serviceEnd };
    const clashOccupied = occupied.some((o) => overlaps(candidate, o));
    const clashBlocked = blocked.some((b) => overlaps(candidate, b));
    if (clashOccupied || clashBlocked) continue;

    slots.push({ startAt: start, endAt: end });
  }

  return slots;
}
