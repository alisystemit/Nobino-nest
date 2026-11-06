// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/financial/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { asNumber } from "@/lib/money";
import { json, apiError } from "@/lib/utils";
import { localParts } from "@/lib/timezone";
import { dayWindow, shiftDay } from "@/lib/time/day-window";

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
    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    // O8: بازه با نیم‌شب به وقت سالن بریده می‌شود؛ «امروز» هم به وقت همان سالن است،
    // نه UTCِ سرور (قبلاً یک بازهٔ ۳۰ روزه می‌توانست ۳۱ روز محلی را بپوشاند).
    const timezone = salon.timezone || "Asia/Tehran";
    const todayLocal = localParts(new Date(), timezone).dayISO;
    const from = url.searchParams.get("from") ?? shiftDay(todayLocal, -30);
    const to = url.searchParams.get("to") ?? todayLocal;
    schema.parse({ from, to });

    const { start } = dayWindow(from, timezone);
    const { end } = dayWindow(to, timezone);

    const appointments = await prisma.appointment.findMany({
      where: { salonId: id, startAt: { gte: start, lt: end } },
      include: { service: { select: { price: true, name: true } } },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
    });

    const services = await prisma.service.findMany({ where: { salonId: id }, select: { id: true, price: true, name: true } });
    const priceMap = new Map(services.map((s) => [s.id, s.price]));

    // O9: مبلغ زمان رزرو (priceSnapshot) مبناست؛ فقط ردیف‌های قدیمی که snapshot
    // ندارند به قیمت جاری خدمت برمی‌گردند (و پاسخ می‌گوید چند ردیف از نوع قدیمی بوده).
    const priceOf = (a: { priceSnapshot: bigint | number | null; serviceId: string | null }) =>
      a.priceSnapshot != null
        ? asNumber(a.priceSnapshot)
        : a.serviceId
          ? asNumber(priceMap.get(a.serviceId) ?? 0)
          : 0;
    let legacyPriced = 0;
    for (const a of appointments) if (a.priceSnapshot === null) legacyPriced++;

    const completed = appointments.filter((a) => a.status === "COMPLETED");
    const cancelled = appointments.filter((a) => a.status === "CANCELLED");
    const requested = appointments.filter((a) => a.status === "REQUESTED");

    const revenue = completed.reduce((s, a) => s + priceOf(a), 0);
    const potentialRevenue = requested.reduce((s, a) => s + priceOf(a), 0);

    // پرداخت‌های سالن در بازه (سفارش‌های اشتراک) — همین‌ها هم به وقت سالن
    const payments = await prisma.order.findMany({
      where: { salonId: id, status: "PAID", createdAt: { gte: start, lt: end } },
      select: { amount: true, createdAt: true },
    });
    const paidTotal = payments.reduce((s, p) => s + asNumber(p.amount), 0);

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
        timezone,
        legacyPricedRows: legacyPriced,
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
