// خودکار: پورت‌شده از src/app/api/appointments/[id]/cancel/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { enqueueInApp, enqueueSms } from "@/lib/notifications/queue";
import { renderSmsTemplate } from "@/lib/notifications/templates";
import { dispatchWebhook } from "@/lib/webhooks";
import { announceDepositRefundDue } from "@/lib/financial/deposit-refund";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ reason: z.string().optional() });

/** لغو نوبت توسط خود مشتری (با رعایت قوانین سالن) */
export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = schema.parse(await req.json());

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { salon: { select: { id: true, name: true, cancelDeadlineHours: true } } },
    });
    if (!appointment) return json({ success: false, error: "نوبت یافت نشد" }, { status: 404 });

    // مالکیت: فقط مشتری همان نوبت
    const isOwner =
      (appointment.customerId && appointment.customerId === user.id) ||
      appointment.customerPhone === user.phone;
    if (!isOwner && user.role !== "ADMIN") {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    if (appointment.status === "COMPLETED" || appointment.status === "CANCELLED") {
      return json({ success: false, error: "این نوبت قابل لغو نیست" }, { status: 400 });
    }

    // قانون لغو: حداقل فاصله تا زمان نوبت
    const deadline = new Date(appointment.startAt.getTime() - appointment.salon.cancelDeadlineHours * 3600 * 1000);
    if (new Date() > deadline && user.role !== "ADMIN") {
      return json({ success: false, error: `طبق قوانین سالن، فقط تا ${appointment.salon.cancelDeadlineHours} ساعت قبل از نوبت می‌توانید لغو کنید.` }, { status: 400 });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: { status: "CANCELLED", cancelReason: body.reason, cancelledAt: new Date() },
    });

    const cancelMsg = await renderSmsTemplate("sms.template.cancel", {
      salon: appointment.salon.name,
      customer: appointment.customerName,
      reason: body.reason ?? "",
    });
    await enqueueSms({
      type: "APPOINTMENT_CANCEL",
      recipient: appointment.customerPhone,
      message: cancelMsg,
      uniqueKey: `cancel:${id}`,
      salonId: appointment.salonId,
    });
    if (appointment.customerId) {
      await enqueueInApp({
        type: "APPOINTMENT_CANCEL",
        userId: appointment.customerId,
        message: `نوبت شما در «${appointment.salon.name}» لغو شد.`,
        uniqueKey: `inapp-cancel:${id}`,
      }).catch(() => {});
    }
    await dispatchWebhook(appointment.salonId, "appointment.cancelled", { appointmentId: id, customerName: appointment.customerName, reason: body.reason });

    // O2: اگر بیعانه پرداخت شده بود، بدهی ثبت و اعلام می‌شود (پیش‌تر پول بی‌صدا می‌ماند)
    const refundDue = await announceDepositRefundDue(id).catch(() => null);

    return json({ success: true, appointment: updated, depositRefund: refundDue ? { status: "DUE", amount: refundDue.amount } : null });
  } catch (err) {
    return apiError(err);
  }
}
