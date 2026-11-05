// خودکار: پورت‌شده از src/app/api/appointments/[id]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";

import { dispatchWebhook } from "@/lib/webhooks";
import { enqueueInApp, enqueueSms } from "@/lib/notifications/queue";
import { credit } from "@/lib/financial/wallet";
import { announceDepositRefundDue } from "@/lib/financial/deposit-refund";
import { syncCustomerProfile } from "@/lib/crm";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
  cancelReason: z.string().optional(),
  depositPaid: z.boolean().optional(),
});

const LOYALTY_POINTS = 10;

/** وضعیت‌هایی که بعد از ثبت دیگر قابل تغییر نیستند (قفل پایانی) */
const TERMINAL_STATUSES = ["COMPLETED", "CANCELLED", "NO_SHOW"];

export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    // فقط آرایشگر (مالک سالن) یا ادمین می‌تواند وضعیت را تغییر دهد
    const user = await requireRole(["SALON_OWNER", "ADMIN", "AGENT"]);
    const { id } = await params;
    const body = schema.parse(await req.json());

    const prev = await prisma.appointment.findUnique({ where: { id }, include: { salon: { select: { id: true, name: true, ownerId: true } } } });
    if (!prev) return json({ success: false, error: "appointment not found" }, { status: 404 });
    if (user.role !== "ADMIN" && prev.salon.ownerId !== user.id) {
      return json({ success: false, error: "forbidden for this salon" }, { status: 403 });
    }

    // وضعیت پایانی قفل است — حتی تغییر به یک وضعیت پایانی دیگر.
    // قبلاً COMPLETED → CANCELLED → COMPLETED مجاز بود و در هر دور امتیاز و کمیسیون
    // دوباره پرداخت می‌شد (چاپ پول). برای اصلاح اشتباه، نوبت باید از مسیر دیگری بسوزد.
    if (TERMINAL_STATUSES.includes(prev.status) && prev.status !== body.status) {
      return json({ success: false, error: "این نوبت در وضعیت پایانی است و قابل تغییر نیست" }, { status: 409 });
    }

    const data: Record<string, unknown> = {};
    if (prev.status !== body.status) data.status = body.status;
    if (body.cancelReason !== undefined) data.cancelReason = body.cancelReason;
    if (body.status === "CANCELLED" && prev.status !== "CANCELLED") data.cancelledAt = new Date();
    if (body.depositPaid !== undefined) data.depositPaid = body.depositPaid;

    // هیچ تغییری خواسته نشده (وضعیت تکراری) → همان پاسخ بی‌ضرر
    if (Object.keys(data).length === 0) {
      return json({ success: true, appointment: prev });
    }

    // انتقال اتمیک با شرط «هنوز همان وضعیت قبلی است»: دو PATCH هم‌زمان فقط یکی
    // برنده می‌شود و جایزه‌ها (امتیاز/کمیسیون) دوباره اجرا نمی‌شوند.
    const guarded = await prisma.appointment.updateMany({ where: { id, status: prev.status }, data });
    if (guarded.count !== 1) {
      const fresh = await prisma.appointment.findUnique({ where: { id } });
      if (fresh && fresh.status === body.status) {
        return json({ success: true, appointment: fresh });
      }
      return json({ success: false, error: "وضعیت این نوبت همین حالا تغییر کرد؛ فهرست را تازه کنید" }, { status: 409 });
    }

    const appointment = await prisma.appointment.findUnique({ where: { id } });

    const justCompleted = body.status === "COMPLETED" && prev.status !== "COMPLETED";

    // کمیسیون فقط یک‌بار برای هر نوبت ثبت می‌شود (کلید طبیعی: خود ردیف دفترکل)
    const commissionAlreadyPaid = justCompleted
      ? !!(await prisma.transaction.findFirst({
          where: { reason: "COMMISSION_EARNING", refType: "Appointment", refId: id },
          select: { id: true },
        }))
      : false;

    // امتیاز وفاداری در صورت مراجعه واقعی
    if (justCompleted && prev.customerId) {
      await prisma.user.update({ where: { id: prev.customerId }, data: { loyaltyPoints: { increment: LOYALTY_POINTS } } });
    }

    // همگام‌سازی CRM پس از مراجعهٔ واقعی
    if (justCompleted) {
      await syncCustomerProfile({
        salonId: prev.salonId,
        phone: prev.customerPhone,
        name: prev.customerName,
        customerId: prev.customerId ?? null,
      }).catch(() => {});
    }

    // کمیسیون آرایشگر (درصدی از قیمت خدمت) در صورت تکمیل
    if (justCompleted && !commissionAlreadyPaid && prev.employeeId && prev.serviceId) {
      const employee = await prisma.staff.findUnique({ where: { id: prev.employeeId } });
      const service = await prisma.service.findUnique({ where: { id: prev.serviceId } });
      if (employee && service && employee.commissionPercent > 0 && employee.userId) {
        // O9: مبنای کمیسیون مبلغ ثبت‌شده در لحظهٔ رزرو است، نه قیمت امروز خدمت؛
        // در رزرو چندخدمتی snapshot مجموع همهٔ خدمات است (پیش‌تر فقط خدمت اول شمرده می‌شد).
        const basis = prev.priceSnapshot ?? service.price;
        const amount = Math.round((basis * employee.commissionPercent) / 100);
        if (amount > 0) {
          await credit(employee.userId, amount, "COMMISSION_EARNING", {
            refType: "Appointment",
            refId: id,
            description: `کمیسیون ${employee.commissionPercent}٪ از «${service.name}» (${basis.toLocaleString("fa-IR")} تومان)`,
          }).catch(() => {});
        }
      }
    }

    // اعلان داخل برنامه برای مشتری (بدون پیامک تکراری)
    if (prev.customerId) {
      const statusText: Record<string, string> = {
        CONFIRMED: "تأیید شد",
        COMPLETED: "انجام شد",
        CANCELLED: "لغو شد",
        NO_SHOW: "به‌عنوان عدم حضور ثبت شد",
      };
      if (statusText[body.status]) {
        await enqueueInApp({
          type: "APPOINTMENT_STATUS",
          userId: prev.customerId,
          message: `وضعیت نوبت شما در «${prev.salon.name}» ${statusText[body.status]}.`,
          uniqueKey: `inapp-status:${id}:${body.status}`,
        }).catch(() => {});
      }
    }

    // وب‌هوک برای تأیید/لغو
    if (body.status === "CONFIRMED") {
      await dispatchWebhook(prev.salonId, "appointment.confirmed", { appointmentId: id, customerName: prev.customerName, startAt: prev.startAt });
    } else if (body.status === "CANCELLED") {
      await dispatchWebhook(prev.salonId, "appointment.cancelled", { appointmentId: id, customerName: prev.customerName, reason: body.cancelReason });
      await enqueueSms({
        type: "APPOINTMENT_CANCEL",
        recipient: prev.customerPhone,
        message: `نوبت شما در «${prev.salon.name}» لغو شد.`,
        uniqueKey: `cancel:${id}`,
        salonId: prev.salonId,
      });
    }

    // O2: لغو یا عدم حضورِ نوبتی که بیعانه‌اش پرداخت شده، بدهی بیعانه می‌سازد.
    // قبلاً فقط وضعیت عوض می‌شد و پول مشتری بی‌صدا در `depositPaid: true` می‌ماند.
    const refundDue =
      (body.status === "CANCELLED" || body.status === "NO_SHOW") && prev.status !== body.status
        ? await announceDepositRefundDue(id).catch(() => null)
        : null;

    return json({ success: true, appointment, depositRefund: refundDue ? { status: "DUE", amount: refundDue.amount } : null });
  } catch (err) {
    return apiError(err);
  }
}
