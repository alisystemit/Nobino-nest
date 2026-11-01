// جزئیات کامل یک سالن برای سوپرادمین (مالک، تماس، شبکه‌های اجتماعی، نقشه، نوبت، درآمد، اشتراک، کارکنان، وضعیت)
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { json, apiError } from "@/lib/utils";
import { salonPublicUrl } from "@/lib/salon-url";

const socialPatchSchema = z
  .object({
    instagram: z.string().trim().max(300).optional().nullable(),
  })
  .refine((b) => Object.prototype.hasOwnProperty.call(b, "instagram"), {
    message: "instagram required",
  });

/** سوپرادمین: تنظیم سریع لینک اینستاگرام یک سالن */
export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await params;
    const body = socialPatchSchema.parse(await req.json());

    const before = await prisma.salon.findUnique({ where: { id } });
    if (!before) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const salon = await prisma.salon.update({ where: { id }, data: { instagram: body.instagram ?? null } });
    await logAudit({
      actorId: user.id,
      actorPhone: user.phone,
      action: "update_salon_instagram",
      entityType: "Salon",
      entityId: id,
      before: { instagram: before.instagram },
      after: { instagram: salon.instagram },
    });

    return json({ success: true, salon: { id: salon.id, instagram: salon.instagram } });
  } catch (err) {
    if (err instanceof z.ZodError) return json({ success: false, error: "فیلد instagram لازم است" }, { status: 400 });
    return apiError(err);
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await params;

    const salon = await prisma.salon.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, phone: true, name: true, email: true, role: true, createdAt: true } },
        _count: {
          select: {
            appointments: true,
            staff: true,
            services: true,
            branches: true,
            reviews: true,
            orders: true,
            customers: true,
            galleryItems: true,
            invoices: true,
            campaigns: true,
            waitlist: true,
            favorites: true,
            cashEntries: true,
            webhooks: true,
            holidays: true,
            timeBlocks: true,
            voiceCalls: true,
            subscriptions: true,
          },
        },
      },
    });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const [
      revenueAgg,
      outstandingAgg,
      subscription,
      recentAppointments,
      statusGroups,
      recentCustomers,
      services,
      staff,
      activeCampaigns,
      latestInvoice,
    ] = await Promise.all([
      prisma.order.aggregate({ where: { salonId: id, status: "PAID" }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { salonId: id, status: "PENDING" }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.subscription.findFirst({
        where: { salonId: id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: { package: { select: { name: true, plan: true, price: true } } },
      }),
      prisma.appointment.findMany({
        where: { salonId: id },
        orderBy: { startAt: "desc" },
        take: 10,
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          startAt: true,
          status: true,
          service: { select: { name: true } },
          employee: { select: { name: true } },
        },
      }),
      prisma.appointment.groupBy({ by: ["status"], where: { salonId: id }, _count: { _all: true } }),
      prisma.salonCustomer.findMany({
        where: { salonId: id },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, name: true, firstName: true, lastName: true, phone: true, visits: true, spend: true, lastVisitAt: true, _count: { select: { notes: true, media: true } } },
      }),
      prisma.service.findMany({ where: { salonId: id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, price: true, durationMin: true, isActive: true } }),
      prisma.staff.findMany({ where: { salonId: id }, select: { id: true, name: true, title: true, isActive: true } }),
      prisma.campaign.findMany({ where: { salonId: id, status: { in: ["SCHEDULED", "SENT"] } }, select: { id: true, name: true, channel: true, status: true } }),
      prisma.invoice.findFirst({ where: { salonId: id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, amount: true, status: true, createdAt: true } }),
    ]);

    const appointmentsByStatus: Record<string, number> = {};
    for (const g of statusGroups) appointmentsByStatus[g.status] = g._count._all;

    return json({
      success: true,
      salon: {
        ...salon,
        publicUrl: salonPublicUrl(salon),
        paidRevenue: revenueAgg._sum.amount ?? 0,
        outstandingAmount: outstandingAgg._sum.amount ?? 0,
        outstandingCount: outstandingAgg._count._all,
        appointmentsByStatus,
        subscription: subscription
          ? {
              plan: subscription.package.plan,
              name: subscription.package.name,
              price: subscription.package.price,
              endsAt: subscription.endsAt,
              period: subscription.period,
              status: subscription.status,
            }
          : null,
        recentAppointments,
        recentCustomers,
        services,
        staffList: staff,
        activeCampaigns,
        latestInvoice,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
