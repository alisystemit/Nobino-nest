// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/excel/route.ts — بدون تغییر منطق
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { asNumber } from "@/lib/money";
import { excelResponse } from "@/lib/export";
import { withinLimit } from "@/lib/plans/limits";

/** خروجی Excel: appointments یا customers */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    if (!(await withinLimit(id, "csvExport"))) {
      return Response.json(
        { success: false, error: "خروجی Excel/CSV در پلن فعلی شما فعال نیست. برای ارتقای پلن به بخش اشتراک مراجعه کنید." },
        { status: 403 }
      );
    }
    const url = new URL(_req.url);
    const type = url.searchParams.get("type") || "appointments";

    if (type === "customers") {
      const customers = await prisma.salonCustomer.findMany({
        where: { salonId: id },
        include: { notes: { orderBy: { createdAt: "desc" } } },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      });
      return excelResponse(
        [
          {
            name: "Customers",
            columns: ["id", "phone", "name", "visits", "spend", "lastVisitAt", "tags", "note", "notes"],
            rows: customers.map((c) => [
              c.id,
              c.phone,
              c.name,
              c.visits,
              asNumber(c.spend),
              c.lastVisitAt?.toISOString() ?? "",
              c.tags.join(" | "),
              c.note ?? "",
              c.notes.map((n) => n.note).join(" | "),
            ]),
          },
        ],
        `salon-${id}-customers.xls`
      );
    }

    const appointments = await prisma.appointment.findMany({
      where: { salonId: id },
      include: { service: { select: { name: true, price: true } }, employee: { select: { name: true } } },
      orderBy: { startAt: "desc" },
      take: 5000,
    });

    return excelResponse(
      [
        {
          name: "Appointments",
          columns: ["id", "customer_name", "customer_phone", "service", "price", "employee", "start_at", "end_at", "status", "channel", "deposit_paid"],
          rows: appointments.map((a) => [
            a.id,
            a.customerName,
            a.customerPhone,
            a.service?.name ?? "",
            a.service ? asNumber(a.service.price) : "",
            a.employee?.name ?? "",
            a.startAt.toISOString(),
            a.endAt.toISOString(),
            a.status,
            a.channel,
            a.depositPaid ? "yes" : "no",
          ]),
        },
      ],
      `salon-${id}-appointments.xls`
    );
  } catch {
    return new Response("unauthorized", { status: 401 });
  }
}