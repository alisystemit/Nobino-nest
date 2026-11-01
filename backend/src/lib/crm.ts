import { prisma } from "@/lib/prisma";
import { withinLimit } from "@/lib/plans/limits";

/**
 * سقف مشتری فقط جلوی «ثبت پروندهٔ جدید» را می‌گیرد. به‌روزرسانی پرونده‌های قبلی
 * همیشه انجام می‌شود و خطای سقف هرگز نباید جریان نوبت‌دهی را متوقف کند، پس این
 * بررسی عمداً fail-open است.
 */
async function canAddNewCustomer(salonId: string): Promise<boolean> {
  try {
    return await withinLimit(salonId, "customers");
  } catch {
    return true;
  }
}

/**
 * ثبت/به‌روزرسانی پروندهٔ مشتری پس از مراجعهٔ واقعی.
 * دفعات بازدید و هزینه‌کرد از روی نوبت‌های تکمیل‌شده محاسبه می‌شود.
 */
export async function syncCustomerProfile(params: {
  salonId: string;
  phone: string;
  name?: string | null;
  customerId?: string | null;
}) {
  const [appointments] = await Promise.all([
    prisma.appointment.findMany({
      where: { salonId: params.salonId, customerPhone: params.phone },
      select: { id: true, status: true, startAt: true, service: { select: { price: true } } },
    }),
  ]);

  const completed = appointments.filter((a) => a.status === "COMPLETED");
  const spend = completed.reduce((sum, a) => sum + (a.service?.price ?? 0), 0);
  const lastVisitAt = completed.length ? completed.reduce((latest, a) => (a.startAt > latest ? a.startAt : latest), completed[0].startAt) : null;

  const existing = await prisma.salonCustomer.findUnique({
    where: { salonId_phone: { salonId: params.salonId, phone: params.phone } },
    select: { id: true },
  });
  if (!existing && !(await canAddNewCustomer(params.salonId))) return null;

  return prisma.salonCustomer.upsert({
    where: { salonId_phone: { salonId: params.salonId, phone: params.phone } },
    create: {
      salonId: params.salonId,
      phone: params.phone,
      name: params.name ?? null,
      visits: completed.length,
      spend,
      lastVisitAt,
    },
    update: {
      name: params.name ?? undefined,
      visits: completed.length,
      spend,
      lastVisitAt,
    },
  });
}
