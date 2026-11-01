import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listOwnerSalons, resolveDashboardSalonId } from "@/lib/salons";
import type { AgendaItem } from "@/lib/appointments/agenda-view";
import { dayWindow, parseDayParam } from "@/lib/time/day-window";
import { todayInZone } from "@/lib/time/zoned";

/**
 * دادهٔ صفحهٔ نوبت‌ها: یک «روز» کامل به وقت سالن، با دامنهٔ دسترسی نقش‌محور.
 * همهٔ منطق خواندن در `src/lib` است و صفحه فقط رندر می‌کند (قاعدهٔ معماری پروژه).
 */

const DEFAULT_TZ = "Asia/Tehran";

/** رکورد خط زمانی — شکل سریال‌پذیر همان `AgendaItem` در `agenda-view` است */
export type AgendaRow = AgendaItem;

export type Agenda = {
  /** روز جاری صفحه (YYYY-MM-DD میلادی) */
  dayISO: string;
  /** «امروز» به وقت سالن — برای برچسب‌های دیروز/فردا و خط «الان» */
  todayISO: string;
  timezone: string;
  rows: AgendaRow[];
  /** سالن‌های مالک برای سوییچر (خالی برای نقش‌های دیگر) */
  salons: { id: string; name: string }[];
  activeSalonId: string | null;
  role: string;
};

type Caller = { id: string; role: string };

export async function loadAgenda(
  user: Caller,
  params: { date?: string | null; salon?: string | null } = {}
): Promise<Agenda> {
  let where: Prisma.AppointmentWhereInput = { id: "" };
  let timezone = DEFAULT_TZ;
  let salons: { id: string; name: string }[] = [];
  let activeSalonId: string | null = null;

  if (user.role === "SALON_OWNER" || user.role === "ADMIN") {
    const isOwner = user.role === "SALON_OWNER";
    // ادمین می‌تواند هر سالنی را از پارام `salon` بگیرد؛ مالک فقط سالن‌های خودش
    const salonId = await resolveDashboardSalonId(user.id, params.salon ?? null, !isOwner);
    if (isOwner) salons = await listOwnerSalons(user.id);
    if (salonId) {
      activeSalonId = salonId;
      where = { salonId };
      const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { timezone: true } });
      timezone = salon?.timezone || DEFAULT_TZ;
    } else if (!isOwner) {
      where = {}; // ادمین بدون انتخاب سالن: نوبت‌های کل پلتفرم
    }
  } else if (user.role === "AGENT") {
    const plans = await prisma.commissionPlan.findMany({
      where: { agentId: user.id, isActive: true },
      select: { salonId: true },
    });
    const salonIds = plans.map((p) => p.salonId);
    where = salonIds.length ? { salonId: { in: salonIds } } : { id: "" };
  } else {
    // CUSTOMER و هر نقش ناشناخته: فقط نوبت‌های خودش
    where = { customerId: user.id };
  }

  const todayISO = todayInZone(timezone);
  const dayISO = parseDayParam(params.date, todayISO);
  const { start, end } = dayWindow(dayISO, timezone);

  const found = await prisma.appointment.findMany({
    where: { ...where, startAt: { gte: start, lt: end } },
    include: {
      service: { select: { id: true, name: true, price: true } },
      salon: { select: { id: true, name: true, slug: true, timezone: true } },
      employee: { select: { id: true, name: true } },
    },
    orderBy: { startAt: "asc" },
    take: 400,
  });

  const rows: AgendaRow[] = found.map((a) => ({
    id: a.id,
    customerName: a.customerName,
    customerPhone: a.customerPhone,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    status: a.status,
    channel: a.channel,
    service: a.service?.name ?? null,
    serviceId: a.service?.id ?? null,
    servicePrice: a.service?.price ?? null,
    employee: a.employee?.name ?? null,
    employeeId: a.employee?.id ?? null,
    branchId: a.branchId,
    note: a.note,
    depositAmount: a.depositAmount,
    depositPaid: a.depositPaid,
    salonId: a.salonId,
    salonName: a.salon?.name ?? null,
    salonSlug: a.salon?.slug ?? null,
    salonTimezone: a.salon?.timezone ?? null,
  }));

  return { dayISO, todayISO, timezone, rows, salons, activeSalonId, role: user.role };
}
