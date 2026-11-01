// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/holidays/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isClosed: z.boolean().optional(),
  openTime: z.string().optional(),
  closeTime: z.string().optional(),
  reason: z.string().optional(),
  branchId: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const url = new URL(_req.url);
    const branchId = url.searchParams.get("branchId") || undefined;
    const holidays = await prisma.holiday.findMany({
      where: branchId ? { salonId: id, branchId } : { salonId: id },
      orderBy: { date: "asc" },
    });
    return json({ success: true, holidays });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = schema.parse(await req.json());
    const holiday = await prisma.holiday.create({
      data: {
        salonId: id,
        branchId: body.branchId,
        date: new Date(body.date + "T00:00:00Z"),
        isClosed: body.isClosed ?? true,
        openTime: body.openTime,
        closeTime: body.closeTime,
        reason: body.reason,
      },
    });
    return json({ success: true, holiday }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}