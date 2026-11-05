// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/import/appointments/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertBookableWindow } from "@/lib/bookings/availability";
import { json, apiError } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

const schema = z.object({
  rows: z
    .array(
      z.object({
        customerName: z.string().min(1).max(60),
        customerPhone: z.string().regex(/^0?9\d{9}$/),
        startAt: z.string().datetime(),
        endAt: z.string().datetime().optional(),
        durationMin: z.number().int().positive().optional(),
        serviceId: z.string().optional(),
        employeeId: z.string().optional(),
        status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).default("COMPLETED"),
        note: z.string().max(500).optional(),
      })
    )
    .max(5000),
});

/**
 * A6: واردات انبوه قبلاً `prisma.appointment.create` خام می‌زد — بدون قفل، بدون
 * بررسی تداخل، بدون TimeBlock و بدون پنجرهٔ کاری؛ یک اکسل می‌توانست تقویم را پر
 * از نوبت هم‌زمان کند (روی Appointment هیچ uniqueای نیست؛ تنها محافظ، قفل
 * تراکنشیِ مسیر عادی است).
 * حالا ردیف‌هایی که ظرفیت را اشغال می‌کنند (REQUESTED/CONFIRMED) همان اعتبارهای
 * مسیر عادی را می‌گذرانند، و درج‌ها در تراکنش‌های کوچکی انجام می‌شوند که هر بار
 * سالن را FOR UPDATE می‌گیرد (قفل بلندمدت روی ۵۰۰۰ ردیف، رزرو زنده را قفل می‌کند).
 */
const CHUNK = 200;

/** ردیف‌هایی که واقعاً ج تقویم را اشغال می‌کنند */
function occupies(row: { status: string }) {
  return row.status === "REQUESTED" || row.status === "CONFIRMED";
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const { rows } = schema.parse(await req.json());

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    let imported = 0;
    const errors: string[] = [];

    for (let offset = 0; offset < rows.length; offset += CHUNK) {
      const chunk = rows.slice(offset, offset + CHUNK);
      await prisma.$transaction(async (tx) => {
        // همان قفلِ مسیر رزرو: همهٔ رزروها و واردات‌های این سالن سری می‌شوند
        await tx.$queryRaw`SELECT id FROM "Salon" WHERE id = ${id}::text FOR UPDATE`;

        for (const [j, row] of chunk.entries()) {
          const where = `ردیف ${offset + j + 1}`;
          try {
            const service = row.serviceId ? await tx.service.findUnique({ where: { id: row.serviceId } }) : null;
            if (row.serviceId && (!service || service.salonId !== id)) throw new Error("خدمت این سالن پیدا نشد");

            const employee = row.employeeId ? await tx.staff.findUnique({ where: { id: row.employeeId } }) : null;
            if (row.employeeId && (!employee || employee.salonId !== id)) throw new Error("آرایشگر این سالن پیدا نشد");

            const startAt = new Date(row.startAt);
            const duration = row.durationMin ?? service?.durationMin ?? 30;
            const endAt = row.endAt ? new Date(row.endAt) : new Date(startAt.getTime() + duration * 60 * 1000);
            if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime())) throw new Error("تاریخ نامعتبر است");
            const minutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
            if (minutes < 1) throw new Error("ساعت پایان باید بعد از ساعت شروع باشد");
            if (minutes > 24 * 60) throw new Error("مدت نوبت بیشتر از ۲۴ ساعت است");
            const phone = row.customerPhone.startsWith("0") ? row.customerPhone : `0${row.customerPhone}`;
            const buffer = service?.bufferMin && service.bufferMin > 0 ? service.bufferMin : salon.bufferMinutes;

            if (occupies(row)) {
              // ساعت کاری/روز تعطیل — همان بررسی مسیر عادی
              await assertBookableWindow({
                salon: { id: salon.id, timezone: salon.timezone },
                start: startAt,
                end: endAt,
                employeeId: row.employeeId ?? undefined,
              });

              // تداخل با نوبت‌های اشغال‌کننده (ردیف‌های همین دسته هم دیده می‌شوند)
              const clashWhere: Prisma.AppointmentWhereInput = {
                salonId: id,
                status: { in: ["REQUESTED", "CONFIRMED"] },
                startAt: { lt: new Date(endAt.getTime() + buffer * 60 * 1000) },
                endAt: { gt: new Date(startAt.getTime() - buffer * 60 * 1000) },
                AND: [...(row.employeeId ? [{ OR: [{ employeeId: row.employeeId }, { employeeId: null }] }] : [])],
              };
              const clash = await tx.appointment.findFirst({ where: clashWhere, select: { id: true, startAt: true } });
              if (clash) throw new Error(`با نوبتِ ساعت ${clash.startAt.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })} تداخل دارد`);

              // تداخل با بازه‌های مسدود
              const blocked = await tx.timeBlock.findFirst({
                where: {
                  salonId: id,
                  startAt: { lt: new Date(endAt.getTime() + buffer * 60 * 1000) },
                  endAt: { gt: new Date(startAt.getTime() - buffer * 60 * 1000) },
                  ...(row.employeeId ? { OR: [{ staffId: row.employeeId }, { staffId: null }] } : {}),
                },
                select: { id: true },
              });
              if (blocked) throw new Error("بازهٔ زمانی این ردیف در تقویم مسدود شده است");
            }

            await tx.appointment.create({
              data: {
                salonId: id,
                serviceId: row.serviceId ?? null,
                employeeId: row.employeeId ?? null,
                customerName: row.customerName,
                customerPhone: phone,
                startAt,
                endAt,
                status: row.status,
                channel: "MANUAL",
                note: [row.note, "IMPORT"].filter(Boolean).join("|"),
                // O9: قیمتِ روزِ واردات فریز می‌شود تا گزارش درآمد بعداً بازنویسی نشود.
                // بیعانه عمداً null است: سوابق بدهکار نمی‌سازد (بخش «بدون بیعانه» یافتهٔ A6).
                priceSnapshot: service?.price ?? null,
                depositAmount: null,
              },
            });
            imported++;
          } catch (e) {
            errors.push(`${where}: ${e instanceof Error ? e.message : "unknown error"}`);
          }
        }
      });
    }

    // بازسازی CRM برای مشتریان واردشده
    const phones = [...new Set(rows.map((r) => (r.customerPhone.startsWith("0") ? r.customerPhone : `0${r.customerPhone}`)))];
    for (const phone of phones) {
      const { syncCustomerProfile } = await import("@/lib/crm");
      await syncCustomerProfile({ salonId: id, phone }).catch(() => {});
    }

    return json({ success: true, imported, total: rows.length, errors });
  } catch (err) {
    return apiError(err);
  }
}
