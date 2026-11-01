// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/services/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().min(1),
  durationMin: z.number().int().positive(),
  price: z.number().int().min(0),
  branchId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  bufferMin: z.number().int().min(0).optional(),
  steps: z.array(z.object({ name: z.string(), durationMin: z.number().int().positive() })).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const services = await prisma.service.findMany({ where: { salonId: id }, orderBy: { createdAt: "asc" } });
    return json({ success: true, services });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const body = createSchema.parse(await req.json());
    // سقف تعداد خدمات پلن (از ماتریس محدودیت‌های پنل سوپرادمین)
    await assertLimit({ salonId: id }, "services");
    const service = await prisma.service.create({ data: { salonId: id, ...body } });
    return json({ success: true, service }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}