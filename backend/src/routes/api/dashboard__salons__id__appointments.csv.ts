// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/appointments.csv/route.ts — بدون تغییر منطق
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { withinLimit } from "@/lib/plans/limits";
import { csvFile } from "@/lib/csv";

/** خروجی CSV نوبت‌های سالن (برای گزارش‌گیری/مهاجرت) */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id } = await params;

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return new Response("سالن یافت نشد", { status: 404 });
    if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
      return new Response("دسترسی غیرمجاز", { status: 403 });
    }
    if (!(await withinLimit(id, "csvExport"))) {
      return new Response("خروجی CSV در پلن فعلی این سالن فعال نیست", { status: 403 });
    }

    const appointments = await prisma.appointment.findMany({
      where: { salonId: id },
      include: { service: { select: { name: true } }, employee: { select: { name: true } } },
      orderBy: { startAt: "desc" },
      take: 5000,
    });

    // C11: سلول‌ها از `lib/csv.ts` می‌گذرند (خنثی‌سازی فرمول + نقل‌قول)
    const header = ["id", "customer_name", "customer_phone", "service", "employee", "start_at", "end_at", "status", "channel", "deposit_paid"];
    const dataRows = appointments.map((r) => [
      r.id,
      r.customerName,
      r.customerPhone,
      r.service?.name ?? "",
      r.employee?.name ?? "",
      r.startAt.toISOString(),
      r.endAt.toISOString(),
      r.status,
      r.channel,
      r.depositPaid,
    ]);

    return new Response(csvFile(header, dataRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="appointments-${salon.slug}.csv"`,
      },
    });
  } catch {
    return new Response("خطا", { status: 500 });
  }
}
