// خودکار: پورت‌شده از src/app/api/admin/charts/route.ts — بدون تغییر منطق


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** داده نمودارهای سوپرادمین: درآمد ماهانه، رشد کاربران، نوبت‌ها، ریزش */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const now = new Date();

    // ۱۲ ماه اخیر
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }

    const monthStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const paidOrders = await prisma.order.findMany({
      where: { status: "PAID", createdAt: { gte: monthStart } },
      select: { amount: true, createdAt: true },
    });
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { createdAt: true },
    });
    const appointments = await prisma.appointment.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { createdAt: true, status: true },
    });
    const subscriptions = await prisma.subscription.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { createdAt: true, status: true },
    });

    const key = (d: Date) => d.toISOString().slice(0, 7);
    const revenue = {} as Record<string, number>;
    const userGrowth = {} as Record<string, number>;
    const apptCount = {} as Record<string, number>;
    const cancelledCount = {} as Record<string, number>;
    const churn = {} as Record<string, number>;
    months.forEach((m) => { revenue[m] = 0; userGrowth[m] = 0; apptCount[m] = 0; cancelledCount[m] = 0; churn[m] = 0; });

    for (const o of paidOrders) revenue[key(o.createdAt)] = (revenue[key(o.createdAt)] ?? 0) + o.amount;
    for (const u of users) userGrowth[key(u.createdAt)] = (userGrowth[key(u.createdAt)] ?? 0) + 1;
    for (const a of appointments) {
      apptCount[key(a.createdAt)] = (apptCount[key(a.createdAt)] ?? 0) + 1;
      if (a.status === "CANCELLED" || a.status === "NO_SHOW") cancelledCount[key(a.createdAt)] = (cancelledCount[key(a.createdAt)] ?? 0) + 1;
    }
    for (const s of subscriptions) if (s.status === "CANCELLED" || s.status === "EXPIRED") churn[key(s.createdAt)] = (churn[key(s.createdAt)] ?? 0) + 1;

    // برچسب ماه‌ها به فارسی (مثلاً «آبان ۱۴۰۵»)
    const monthLabels = months.map((m) =>
      new Intl.DateTimeFormat("fa-IR", { month: "long", year: "numeric" }).format(new Date(`${m}-01T12:00:00`))
    );

    return json({
      success: true,
      months: monthLabels,
      revenue: months.map((m) => revenue[m]),
      userGrowth: months.map((m) => userGrowth[m]),
      appointments: months.map((m) => apptCount[m]),
      cancelled: months.map((m) => cancelledCount[m]),
      churn: months.map((m) => churn[m]),
    });
  } catch (err) {
    return apiError(err);
  }
}

