// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/reminders/route.ts — بدون تغییر منطق
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const WINDOWS = ["24h", "2h", "1h"];

/**
 * وضعیت یادآوری‌های پیامکی نوبت‌های یک روز خاص.
 * سالن‌دار باید بداند اگر یادآوری به مشتری ارسال نشده (یا ناموفق بوده)،
 * خودش تماس بگیرد. برای هر نوبت، وضعیت هر پنجره ارسال برمی‌گردد.
 */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const url = new URL(_req.url);
    const date = url.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ success: false, error: "پارامتر date معتبر نیست" }, { status: 400 });
    }

    // بازه روز بر اساس منطقه زمانی سالن
    const salon = await prisma.salon.findUnique({ where: { id }, select: { timezone: true } });
    const tz = salon?.timezone ?? "Asia/Tehran";
    const startAt = new Date(`${date}T00:00:00.000Z`);
    const endAt = new Date(`${date}T23:59:59.999Z`);

    const appointments = await prisma.appointment.findMany({
      where: {
        salonId: id,
        status: { in: ["REQUESTED", "CONFIRMED"] },
        startAt: { gte: startAt, lte: endAt },
      },
      select: { id: true, customerName: true, customerPhone: true, startAt: true, status: true },
      orderBy: { startAt: "asc" },
    });

    if (appointments.length === 0) {
      return json({ success: true, timezone: tz, items: [] });
    }

    // کلیدهای یکتای یادآوری برای همه نوبت‌های این روز
    const keys = appointments.flatMap((a) => WINDOWS.map((w) => `reminder:${w}:${a.id}`));
    const notifs = await prisma.notification.findMany({
      where: { uniqueKey: { in: keys } },
      select: { uniqueKey: true, status: true, attempts: true, lastError: true, sentAt: true },
    });

    const byKey = new Map(notifs.map((n) => [n.uniqueKey, n]));
    const items = appointments.map((a) => {
      const windows = WINDOWS.map((w) => {
        const key = `reminder:${w}:${a.id}`;
        const n = byKey.get(key);
        return {
          window: w,
          status: n ? (n.status === "SENT" ? "SENT" : n.status === "PENDING" ? "PENDING" : "FAILED") : "NOT_QUEUED",
          attempts: n?.attempts ?? 0,
          lastError: n?.lastError ?? null,
          sentAt: n?.sentAt ?? null,
        };
      });
      const failed = windows.filter((w) => w.status === "FAILED").length;
      const sent = windows.filter((w) => w.status === "SENT").length;
      const none = windows.every((w) => w.status === "NOT_QUEUED");
      return {
        id: a.id,
        customerName: a.customerName,
        customerPhone: a.customerPhone,
        startAt: a.startAt.toISOString(),
        status: a.status,
        windows,
        problem: failed > 0 ? "FAILED" : none ? "NOT_QUEUED" : sent === 0 && windows.some((w) => w.status === "PENDING") ? "PENDING" : null,
      };
    });

    return json({ success: true, timezone: tz, items });
  } catch (err) {
    return apiError(err);
  }
}
