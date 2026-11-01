// خودکار: پورت‌شده از src/app/api/appointments/[id]/reschedule/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { rescheduleAppointmentSafe } from "@/lib/bookings/reschedule";
import { enqueueInApp, enqueueSms } from "@/lib/notifications/queue";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ startAt: z.string().datetime() });

/** جابه‌جایی زمان نوبت توسط مشتری/مالک (با محافظت از تداخل) */
export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { salon: { select: { id: true, name: true } } },
    });
    if (!appointment) return json({ success: false, error: "نوبت یافت نشد" }, { status: 404 });

    const isOwner = (appointment.customerId && appointment.customerId === user.id) || appointment.customerPhone === user.phone;
    const isStaff = user.role === "SALON_OWNER" || user.role === "ADMIN";
    if (!isOwner && !isStaff) {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }
    if (appointment.status === "COMPLETED" || appointment.status === "CANCELLED") {
      return json({ success: false, error: "این نوبت قابل تغییر نیست" }, { status: 400 });
    }

    const updated = await rescheduleAppointmentSafe(id, new Date(body.startAt), {
      enforceCancelDeadline: !isStaff,
    });

    const newTime = new Intl.DateTimeFormat("fa-IR", { timeStyle: "short" }).format(updated.startAt);
    await enqueueSms({
      type: "APPOINTMENT_CHANGED",
      recipient: appointment.customerPhone,
      message: `نوبت شما در «${appointment.salon.name}» به ساعت ${newTime} تغییر کرد.`,
      uniqueKey: `changed:${id}:${updated.startAt.getTime()}`,
      salonId: appointment.salonId,
    });
    if (appointment.customerId) {
      await enqueueInApp({
        type: "APPOINTMENT_CHANGED",
        userId: appointment.customerId,
        message: `زمان نوبت شما در «${appointment.salon.name}» به ${newTime} تغییر کرد.`,
        uniqueKey: `inapp-changed:${id}:${updated.startAt.getTime()}`,
      }).catch(() => {});
    }

    return json({ success: true, appointment: updated });
  } catch (err) {
    return apiError(err);
  }
}
