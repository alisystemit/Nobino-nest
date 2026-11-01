// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/revenue/route.ts — بدون تغییر منطق
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** داده سری زمانی درآمد/نوبت برای نمودار (۳۰ روز اخیر) */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const since = new Date(Date.now() - 30 * 864e5);
    since.setHours(0, 0, 0, 0);

    const appointments = await prisma.appointment.findMany({
      where: { salonId: id, startAt: { gte: since } },
      select: { startAt: true, status: true, serviceId: true },
    });

    const services = await prisma.service.findMany({ where: { salonId: id }, select: { id: true, price: true } });
    const priceMap = new Map(services.map((s) => [s.id, s.price]));

    // روزانه: +وبت، درآمد انجام‌شده، لغو
    const daily: Record<string, { appointments: number; revenue: number; cancelled: number }> = {};
    for (let i = 30; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      daily[d.toISOString().slice(0, 10)] = { appointments: 0, revenue: 0, cancelled: 0 };
    }

    for (const a of appointments) {
      const key = a.startAt.toISOString().slice(0, 10);
      if (!daily[key]) continue;
      daily[key].appointments++;
      if (a.status === "COMPLETED" && a.serviceId) {
        daily[key].revenue += priceMap.get(a.serviceId) ?? 0;
      }
      if (a.status === "CANCELLED") daily[key].cancelled++;
    }

    const labels = Object.keys(daily).sort();
    const series = labels.map((l) => daily[l]);

    return json({
      success: true,
      labels,
      appointments: series.map((s) => s.appointments),
      revenue: series.map((s) => s.revenue),
      cancelled: series.map((s) => s.cancelled),
    });
  } catch (err) {
    return apiError(err);
  }
}
