// خودکار: پورت‌شده از src/app/api/appointments/hold/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAppointmentSafe } from "@/lib/bookings/create";
import { json, apiError } from "@/lib/utils";
import { HOLD_MARKER } from "@/lib/markers";

const HOLD_MINUTES = 15;

const schema = z.object({
  salonId: z.string(),
  serviceId: z.string().optional(),
  employeeId: z.string().optional(),
  branchId: z.string().optional(),
  startAt: z.string().datetime(),
  durationMin: z.number().int().positive().optional(),
});

/** قفل موقت بازه هنگام پرداخت/تأیید (ضد رزرو هم‌زمان در لحظه خرید) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());

    const salon = await prisma.salon.findUnique({ where: { id: body.salonId } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    let duration = body.durationMin;
    if (body.serviceId) {
      // مدت خدمت همیشه از دیتابیس خوانده می‌شود و باید متعلق به همین سالن باشد
      const svc = await prisma.service.findFirst({ where: { id: body.serviceId, salonId: salon.id, isActive: true } });
      if (!svc) return json({ success: false, error: "خدمت یافت نشد" }, { status: 404 });
      duration = svc.durationMin;
    }
    duration = duration ?? 60;

    if (body.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: body.branchId }, select: { salonId: true } });
      if (!branch || branch.salonId !== salon.id) {
        return json({ success: false, error: "شعبه یافت نشد" }, { status: 400 });
      }
    }

    const appointment = await createAppointmentSafe({
      salonId: salon.id,
      serviceId: body.serviceId,
      employeeId: body.employeeId,
      branchId: body.branchId,
      customerName: "در انتظار پرداخت",
      customerPhone: "0000000000",
      startAt: new Date(body.startAt),
      durationMin: duration,
      channel: "WEBAPP",
      note: HOLD_MARKER,
    });

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
    const held = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { tempLockExpiresAt: expiresAt },
    });

    return json({ success: true, holdId: held.id, expiresAt }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
