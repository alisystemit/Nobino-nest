// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/import/appointments/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  rows: z
    .array(
      z.object({
        customerName: z.string().min(1),
        customerPhone: z.string().regex(/^0?9\d{9}$/),
        startAt: z.string().datetime(),
        endAt: z.string().datetime().optional(),
        durationMin: z.number().int().positive().optional(),
        serviceId: z.string().optional(),
        employeeId: z.string().optional(),
        status: z.enum(["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).default("COMPLETED"),
        note: z.string().optional(),
      })
    )
    .max(5000),
});

/** ورود داده قدیمی نوبت‌ها (تاریخچه) با درج مستقیم برای بازسازی سوابق */
export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const { rows } = schema.parse(await req.json());

    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        const service = row.serviceId ? await prisma.service.findUnique({ where: { id: row.serviceId } }) : null;
        if (row.serviceId && (!service || service.salonId !== id)) throw new Error("service not found");

        const employee = row.employeeId ? await prisma.staff.findUnique({ where: { id: row.employeeId } }) : null;
        if (row.employeeId && (!employee || employee.salonId !== id)) throw new Error("employee not found");

        const startAt = new Date(row.startAt);
        const duration = row.durationMin ?? service?.durationMin ?? 30;
        const endAt = row.endAt ? new Date(row.endAt) : new Date(startAt.getTime() + duration * 60 * 1000);
        const phone = row.customerPhone.startsWith("0") ? row.customerPhone : `0${row.customerPhone}`;

        await prisma.appointment.create({
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
          },
        });
        imported++;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "unknown error");
      }
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