// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/financial/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** گزارش مالی بازه‌ای: فروش، درآمد خدمات، لغو/بازپرداخت، پرداخت‌ها */
export async function GET(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id } = await params;

    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
    schema.parse({ from, to });

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T23:59:59.999");

    const appointments = await prisma.appointment.findMany({
      where: { salonId: id, startAt: { gte: start, lte: end } },
      include: { service: { select: { price: true, name: true } } },
    });

    const services = await prisma.service.findMany({ where: { salonId: id }, select: { id: true, price: true, name: true } });
    const priceMap = new Map(services.map((s) => [s.id, s.price]));

    const completed = appointments.filter((a) => a.status === "COMPLETED");
    const cancelled = appointments.filter((a) => a.status === "CANCELLED");
    const requested = appointments.filter((a) => a.status === "REQUESTED");

    const revenue = completed.reduce((s, a) => s + (a.serviceId ? priceMap.get(a.serviceId) ?? 0 : 0), 0);
    const potentialRevenue = requested.reduce((s, a) => s + (a.serviceId ? priceMap.get(a.serviceId) ?? 0 : 0), 0);

    // پرداخت‌های سالن در بازه (سفارش‌های اشتراک)
    const payments = await prisma.order.findMany({
      where: { salonId: id, status: "PAID", createdAt: { gte: start, lte: end } },
      select: { amount: true, createdAt: true },
    });
    const paidTotal = payments.reduce((s, p) => s + p.amount, 0);

    // خدمات پرفروش
    const serviceCount: Record<string, number> = {};
    for (const a of completed) {
      if (a.serviceId) serviceCount[a.serviceId] = (serviceCount[a.serviceId] ?? 0) + 1;
    }
    const topServices = Object.entries(serviceCount)
      .map(([id, count]) => ({ id, name: services.find((s) => s.id === id)?.name ?? "", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return json({
      success: true,
      report: {
        from,
        to,
        totalAppointments: appointments.length,
        completed: completed.length,
        cancelled: cancelled.length,
        requested: requested.length,
        revenue,
        revenueLabel: revenue.toLocaleString("fa-IR"),
        potentialRevenue,
        paidSubscriptions: paidTotal,
        paidSubscriptionsLabel: paidTotal.toLocaleString("fa-IR"),
        topServices,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
