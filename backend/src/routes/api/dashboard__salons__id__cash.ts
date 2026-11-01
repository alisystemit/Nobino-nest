// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/cash/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const createSchema = z.object({
  branchId: z.string().optional(),
  cashAmount: z.number().int().min(0).default(0),
  cardAmount: z.number().int().min(0).default(0),
  onlineAmount: z.number().int().min(0).default(0),
  expenseAmount: z.number().int().min(0).default(0),
  note: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const entries = await prisma.cashRegisterEntry.findMany({
      where: { salonId: id },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const today = entries.filter((e) => e.createdAt >= todayStart);
    const sum = (arr: typeof today, key: "cashAmount" | "cardAmount" | "onlineAmount" | "expenseAmount") =>
      arr.reduce((s, e) => s + e[key], 0);

    return json({
      success: true,
      entries,
      todayTotals: {
        cash: sum(today, "cashAmount"),
        card: sum(today, "cardAmount"),
        online: sum(today, "onlineAmount"),
        expense: sum(today, "expenseAmount"),
        net: sum(today, "cashAmount") + sum(today, "cardAmount") + sum(today, "onlineAmount") - sum(today, "expenseAmount"),
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireSalonManage(id);
    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    const body = createSchema.parse(await req.json());
    const entry = await prisma.cashRegisterEntry.create({ data: { salonId: id, createdById: user.id, ...body } });
    return json({ success: true, entry }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
