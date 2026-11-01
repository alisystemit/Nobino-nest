import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/**
 * پروندهٔ کامل یک مشتری در یک سالن: اطلاعات، نوبت‌های قبلی، یادداشت‌ها و فایل‌ها.
 * همهٔ کوئری‌ها با salonId محدود می‌شوند تا دادهٔ سالن‌های دیگر هرگز دیده نشود.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string; customerId: string } | Promise<{ id: string; customerId: string }> },
) {
  try {
    const { id, customerId } = await params;
    await requireSalonManage(id);

    const customer = await prisma.salonCustomer.findFirst({
      where: { id: customerId, salonId: id },
      include: {
        notes: { orderBy: { createdAt: "desc" } },
        media: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!customer) return json({ success: false, error: "مشتری یافت نشد" }, { status: 404 });

    const appointments = await prisma.appointment.findMany({
      where: { salonId: id, customerPhone: customer.phone },
      orderBy: { startAt: "desc" },
      take: 100,
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        startAt: true,
        endAt: true,
        status: true,
        channel: true,
        note: true,
        depositAmount: true,
        depositPaid: true,
        service: { select: { id: true, name: true, price: true, durationMin: true } },
        employee: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    });

    const completed = appointments.filter((a) => a.status === "COMPLETED");
    const stats = {
      visits: appointments.length,
      completed: completed.length,
      cancelled: appointments.filter((a) => a.status === "CANCELLED").length,
      noShow: appointments.filter((a) => a.status === "NO_SHOW").length,
      spend: completed.reduce((sum, a) => sum + (a.service?.price ?? 0), 0),
      lastVisit: completed[0]?.startAt ?? appointments[0]?.startAt ?? null,
    };

    return json({ success: true, customer, appointments, stats, noteLimit: 5, mediaLimit: 10 });
  } catch (err) {
    return apiError(err);
  }
}
