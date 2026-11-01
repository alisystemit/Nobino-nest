// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/hours/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const daySchema = z.object({ dayOfWeek: z.number().int().min(0).max(6), openTime: z.string().regex(/^\d{2}:\d{2}$/), closeTime: z.string().regex(/^\d{2}:\d{2}$/), isClosed: z.boolean().default(false) });

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const hours = await prisma.openingHour.findMany({ where: { salonId: id }, orderBy: { dayOfWeek: "asc" } });
    return json({ success: true, hours });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    const body = z.object({ days: z.array(daySchema) }).parse(await req.json());
    const existing = await prisma.openingHour.findMany({ where: { salonId: id } });

    for (const d of body.days) {
      const prev = existing.find((e) => e.dayOfWeek === d.dayOfWeek);
      if (prev) {
        await prisma.openingHour.update({ where: { id: prev.id }, data: { openTime: d.openTime, closeTime: d.closeTime, isClosed: d.isClosed } });
      } else {
        await prisma.openingHour.create({ data: { salonId: id, ...d } });
      }
    }

    const hours = await prisma.openingHour.findMany({ where: { salonId: id }, orderBy: { dayOfWeek: "asc" } });
    return json({ success: true, hours });
  } catch (err) {
    return apiError(err);
  }
}
