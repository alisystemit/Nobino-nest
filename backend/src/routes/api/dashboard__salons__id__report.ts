// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/report/route.ts — بدون تغییر منطق
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

/**
 * گزارش عملکرد سالن:
 * - نرخ مراجعه مجدد (مشتریان بازگشتی)
 * - نرخ لغو
 * - ساعات پرتقاضا (توزیع نوبت‌ها بر اساس ساعت)
 * - بهره‌وری کارکنان (تعداد نوبت انجام‌شده + درآمد هر کارمند)
 * - مشتریان جدید امروز
 */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const url = new URL(_req.url);
    const branchId = url.searchParams.get("branchId") || undefined;

    const baseWhere: Prisma.AppointmentWhereInput = { salonId: id };
    if (branchId) baseWhere.branchId = branchId;

    const [total, completed, cancelled, appointments, distinctCustomers, employees] = await Promise.all([
      prisma.appointment.count({ where: baseWhere }),
      prisma.appointment.count({ where: { ...baseWhere, status: "COMPLETED" } }),
      prisma.appointment.count({ where: { ...baseWhere, status: "CANCELLED" } }),
      prisma.appointment.findMany({
        where: baseWhere,
        select: { startAt: true, status: true, customerPhone: true, employeeId: true, serviceId: true },
        take: 5000,
      }),
      prisma.appointment.groupBy({ by: ["customerPhone"], where: baseWhere, _count: { _all: true } }),
      prisma.staff.findMany({ where: branchId ? { salonId: id, branchId } : { salonId: id }, select: { id: true, name: true } }),
    ]);

    // نرخ مراجعه مجدد: مشتریانی که بیش از یک نوبت داشته‌اند
    const repeat = distinctCustomers.filter((c) => c._count._all > 1).length;
    const returnRate = distinctCustomers.length ? Math.round((repeat / distinctCustomers.length) * 100) : 0;
    const cancelRate = total ? Math.round((cancelled / total) * 100) : 0;

    // ساعات پرتقاضا: توزیع نوبت‌ها بر اساس ساعت
    const hourCount: Record<number, number> = {};
    for (const a of appointments) {
      const h = a.startAt.getHours();
      hourCount[h] = (hourCount[h] ?? 0) + 1;
    }
    const peakHours = Object.entries(hourCount)
      .map(([h, count]) => ({ hour: Number(h), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // بهره‌وری کارکنان
    const staffPerformance = employees.map((emp) => {
      const empAppts = appointments.filter((a) => a.employeeId === emp.id);
      const done = empAppts.filter((a) => a.status === "COMPLETED").length;
      return { id: emp.id, name: emp.name, total: empAppts.length, completed: done };
    });

    // امروز
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const newTodayWhere: Prisma.AppointmentWhereInput = { salonId: id, createdAt: { gte: todayStart } };
    if (branchId) newTodayWhere.branchId = branchId;
    const newToday = await prisma.appointment.count({ where: newTodayWhere });

    return json({
      success: true,
      report: {
        total,
        completed,
        cancelled,
        cancelRate,
        distinctCustomers: distinctCustomers.length,
        repeatCustomers: repeat,
        returnRate,
        newCustomersToday: newToday,
        peakHours,
        staffPerformance,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
