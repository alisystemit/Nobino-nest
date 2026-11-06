// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/revenue/route.ts — روزها به وقت سالن (O8) و مبلغ زمان رزرو (O9)
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { asNumber } from "@/lib/money";
import { json, apiError } from "@/lib/utils";
import { localParts } from "@/lib/timezone";
import { dayWindow, shiftDay } from "@/lib/time/day-window";

const WINDOW_DAYS = 30;

/** داده سری زمانی درآمد/نوبت برای نمودار (۳۰ روز اخیر) */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const salon = await prisma.salon.findUnique({ where: { id }, select: { timezone: true } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    // O8: سطل‌ها «روز محلی سالن»‌اند. پیش‌تر `toISOString().slice(0,10)` روز UTC را
    // می‌داد، پس نوبت ۲۳:۵۰ وال‌کلوک تهران در سطل روز قبل می‌نشست و جمع با تابلو
    // نمی‌خواند. اینجا روزِ امروز به وقت سالن پیدا و بعد به UTC برمی‌گردیم.
    const timezone = salon.timezone || "Asia/Tehran";
    const today = localParts(new Date(), timezone).dayISO;
    const keys: string[] = [];
    for (let i = WINDOW_DAYS; i >= 0; i--) keys.push(shiftDay(today, -i));

    const { start: since } = dayWindow(keys[0] as string, timezone);

    const [rows, services] = await Promise.all([
      prisma.appointment.findMany({
        where: { salonId: id, startAt: { gte: since } },
        select: { startAt: true, status: true, serviceId: true, priceSnapshot: true },
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
      }),
      prisma.service.findMany({ where: { salonId: id }, select: { id: true, price: true } }),
    ]);
    const priceMap = new Map(services.map((s) => [s.id, s.price]));

    // O9: مبنای درآمد مبلغی است که در لحظهٔ رزرو ثبت شده (priceSnapshot)؛
    // ردیف‌های قدیمی snapshot ندارند و به قیمت جاری خدمت برمی‌گردند.
    const daily: Record<string, { appointments: number; revenue: number; cancelled: number }> = {};
    for (const k of keys) daily[k] = { appointments: 0, revenue: 0, cancelled: 0 };

    let legacyPriced = 0;
    for (const a of rows) {
      // کلید روز محلی خودِ نوبت، نه UTC
      const key = localParts(a.startAt, timezone).dayISO;
      const bucket = daily[key];
      if (!bucket) continue;
      bucket.appointments++;
      if (a.status === "COMPLETED") {
        if (a.priceSnapshot !== null) {
          bucket.revenue += asNumber(a.priceSnapshot);
        } else {
          legacyPriced++;
          bucket.revenue += a.serviceId ? asNumber(priceMap.get(a.serviceId) ?? 0) : 0;
        }
      }
      if (a.status === "CANCELLED") bucket.cancelled++;
    }

    const series = keys.map((k) => daily[k] as { appointments: number; revenue: number; cancelled: number });

    return json({
      success: true,
      labels: keys,
      appointments: series.map((s) => s.appointments),
      revenue: series.map((s) => s.revenue),
      cancelled: series.map((s) => s.cancelled),
      timezone,
      legacyPricedRows: legacyPriced,
    });
  } catch (err) {
    return apiError(err);
  }
}
