// خودکار: پورت‌شده از src/app/api/admin/salons/[id]/status/route.ts — بدون تغییر منطق
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { enqueueInApp, enqueueSms } from "@/lib/notifications/queue";
import { json, apiError } from "@/lib/utils";

const schema = z
  .object({
    isApproved: z.boolean().optional(),
    isActive: z.boolean().optional(),
    // A8: تصمیم باید دلیل و پیام داشته باشد؛ هم برای ادیت لاگ، هم برای مالک سالن
    reason: z.string().trim().max(200).optional(),
    /**
     * لغو نوبت‌های «در انتظار/تأییدشده» آینده هنگام غیرفعال‌سازی.
     * پیش‌فرض خاموش است: غیرفعال‌سازی نباید بی‌صدا نوبت‌ها را نابود کند.
     */
    cancelUpcoming: z.boolean().optional(),
  })
  .refine((b) => b.isApproved !== undefined || b.isActive !== undefined, { message: "هیچ تغییری ارسال نشده است" });

/** تأیید / تعلیق / غیرفعال‌سازی سالن توسط سوپرادمین */
export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await params;
    const body = schema.parse(await req.json());

    const before = await prisma.salon.findUnique({ where: { id } });
    if (!before) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const salon = await prisma.salon.update({
      where: { id },
      data: {
        ...(body.isApproved !== undefined ? { isApproved: body.isApproved } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });

    const deactivated = !salon.isActive || !salon.isApproved;
    const upcomingWhere: Prisma.AppointmentWhereInput = {
      salonId: id,
      status: { in: ["REQUESTED", "CONFIRMED"] },
      startAt: { gte: new Date() },
    };
    const upcoming = deactivated ? await prisma.appointment.count({ where: upcomingWhere }) : 0;

    let cancelledUpcoming = 0;
    if (deactivated && body.cancelUpcoming) {
      const rows = await prisma.appointment.findMany({
        where: upcomingWhere,
        select: { id: true, customerName: true, customerPhone: true, customerId: true },
        take: 2000,
      });
      if (rows.length) {
        const reason = body.reason || "مدیریت سامانه سالن را غیرفعال کرده است";
        await prisma.appointment.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: `لغو خودکار — ${reason}`.slice(0, 200) },
        });
        for (const r of rows) {
          await enqueueSms({
            type: "APPOINTMENT_CANCELLED",
            recipient: r.customerPhone,
            message: `نوبت شما در «${salon.name}» لغو شد (${reason}). برای نوبت دوباره با سالن تماس بگیرید.`,
            uniqueKey: `salon-deactivated:${r.id}`,
            salonId: id,
          }).catch(() => {});
          if (r.customerId) {
            await enqueueInApp({
              type: "APPOINTMENT_CANCELLED",
              userId: r.customerId,
              message: `نوبت شما در «${salon.name}» به دلیل غیرفعال شدن سالن لغو شد.`,
              uniqueKey: `inapp-salon-deactivated:${r.id}`,
              salonId: id,
            }).catch(() => {});
          }
        }
        cancelledUpcoming = rows.length;
      }
    }

    // اطلاع قطعی به مالک سالن — قبلاً فقط دیتابیس عوض می‌شد و صاحب سالن خبر نداشت
    const statusText = !salon.isActive && !salon.isApproved
      ? "غیرفعال شد و تأیید آن لغو است"
      : !salon.isActive
        ? "غیرفعال شد"
        : !salon.isApproved
          ? "تأیید آن موقتاً لغو شد"
          : "دوباره فعال و تأیید شد";
    const cleanMessage =
      `«${salon.name}» ${statusText}${body.reason ? ` — دلیل: ${body.reason}` : ""}.` +
      (deactivated && body.cancelUpcoming
        ? ` ${cancelledUpcoming.toLocaleString("fa-IR")} نوبت آینده لغو شد.`
        : deactivated
          ? ` ${upcoming.toLocaleString("fa-IR")} نوبت آیندهٔ این سالن همچنان برجا است.`
          : "");

    const owner = await prisma.user.findUnique({ where: { id: salon.ownerId }, select: { id: true, phone: true } });
    if (owner) {
      await enqueueInApp({
        type: "SALON_STATUS_CHANGED",
        userId: owner.id,
        message: cleanMessage + (upcoming && !body.cancelUpcoming ? ` ${upcoming.toLocaleString("fa-IR")} نوبت آیندهٔ این سالن همچنان برجا است.` : ""),
        uniqueKey: `salon-status:${id}:${Date.now()}`,
        salonId: id,
      }).catch(() => {});
      if (owner.phone) {
        await enqueueSms({
          type: "SALON_STATUS_CHANGED",
          recipient: owner.phone,
          message: cleanMessage,
          uniqueKey: `salon-status-sms:${id}:${Date.now()}`,
          salonId: id,
        }).catch(() => {});
      }
    }

    await logAudit({
      actorId: user.id,
      actorPhone: user.phone,
      action: "change_salon_status",
      entityType: "Salon",
      entityId: id,
      before: { isApproved: before.isApproved, isActive: before.isActive },
      after: { isApproved: salon.isApproved, isActive: salon.isActive, reason: body.reason ?? null, cancelledUpcoming },
    });

    return json({
      success: true,
      salon,
      message: cleanMessage,
      effects: {
        deactivated,
        upcomingAppointments: upcoming,
        cancelledUpcoming,
        // وب‌هوک و یادآوری از همین لحظه متوقف می‌شوند (lib/webhooks.ts و cron/reminders)
        webhooksPaused: deactivated,
        remindersPaused: deactivated,
        ownerNotified: Boolean(owner),
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
