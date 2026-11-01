// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/blocks/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const createSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().optional(),
  staffId: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const blocks = await prisma.timeBlock.findMany({
      where: { salonId: id },
      include: { staff: { select: { name: true } } },
      orderBy: { startAt: "asc" },
    });
    return json({ success: true, blocks });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    const body = createSchema.parse(await req.json());
    const start = new Date(body.startAt);
    const end = new Date(body.endAt);
    if (end <= start) return json({ success: false, error: "زمان پایان باید بعد از شروع باشد" }, { status: 400 });

    const block = await prisma.timeBlock.create({
      data: { salonId: id, startAt: start, endAt: end, reason: body.reason, staffId: body.staffId },
    });
    return json({ success: true, block }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
