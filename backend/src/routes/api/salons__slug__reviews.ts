// خودکار: پورت‌شده از src/app/api/salons/[slug]/reviews/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";


const createSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  staffId: z.string().optional(),
  appointmentId: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const salon = await prisma.salon.findUnique({ where: { slug } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const reviews = await prisma.review.findMany({
      where: { salonId: salon.id },
      include: { customer: { select: { name: true, phone: true } }, staff: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const agg = await prisma.review.aggregate({
      where: { salonId: salon.id },
      _avg: { rating: true },
      _count: { _all: true },
    });

    return json({
      success: true,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        customerName: r.customer.name ?? r.customer.phone,
        staff: r.staff?.name ?? null,
        createdAt: r.createdAt,
      })),
      summary: { average: Number((agg._avg.rating ?? 0).toFixed(1)), count: agg._count._all },
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  try {
    const user = await requireAuth();
    const { slug } = await params;
    const salon = await prisma.salon.findUnique({ where: { slug } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const body = createSchema.parse(await req.json());

    // O�U.OU+ O�U.O�U+U_OO�UO: OO� appointmentId U.O�O3O_U^O_O3OO�UO U.O'O�O�UO UcU+UOO_ O�O U�O�OUOO'U_O� U.O�O3O_U^O_O3OO�UO U.O'O�O�UO (O�U.OU+ O�U.O�U+U_OO�UO)
    let appointment = null as { id: string; salonId: string; customerId: string | null; status: string } | null;
    if (body.appointmentId) {
      appointment = await prisma.appointment.findUnique({
        where: { id: body.appointmentId },
        select: { id: true, salonId: true, customerId: true, status: true },
      });
      if (!appointment || appointment.salonId !== salon.id || appointment.customerId !== user.id) {
        return json({ success: false, error: "appointment not found" }, { status: 404 });
      }
      if (appointment.status !== "COMPLETED") {
        return json({ success: false, error: "review requires completed visit" }, { status: 403 });
      }
      const existingReview = await prisma.review.findUnique({ where: { appointmentId: body.appointmentId } });
      if (existingReview) {
        return json({ success: false, error: "review already exists for this appointment" }, { status: 409 });
      }
    } else {
      const completed = await prisma.appointment.findFirst({
        where: { salonId: salon.id, customerId: user.id, status: "COMPLETED" },
        select: { id: true },
      });
      if (!completed) {
        return json({ success: false, error: "review requires completed visit" }, { status: 403 });
      }
    }

    if (body.staffId) {
      const staff = await prisma.staff.findUnique({ where: { id: body.staffId } });
      if (!staff || staff.salonId !== salon.id) {
        return json({ success: false, error: "آرایشگر یافت نشد" }, { status: 404 });
      }
    }

    const review = await prisma.review.create({
      data: {
        salonId: salon.id,
        staffId: body.staffId,
        customerId: user.id,
        appointmentId: body.appointmentId ?? null,
        rating: body.rating,
        comment: body.comment,
      },
    });

    return json({ success: true, review }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
