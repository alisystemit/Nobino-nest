// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/cash/route.ts — منطق روز به وقت سالن (O8)
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination } from "@/lib/utils";
import { localParts } from "@/lib/timezone";
import { dayWindow } from "@/lib/time/day-window";

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

    const { page, limit, skip, take } = getPagination(_req.url, 25, 200);
    const entriesWhere = { salonId: id };

    // O8: «امروز» با نیم‌شب به وقت خودِ سالن شروع می‌شود، نه ساعت صفر سرور.
    // روی هاست UTC قبلاً کارت‌های ۰۳:۳۰ تا ۰۳:۲۹ Tehran در دو روز مختلف می‌نشستند.
    const salon = await prisma.salon.findUnique({ where: { id }, select: { timezone: true } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    const timezone = salon.timezone || "Asia/Tehran";
    const todayKey = localParts(new Date(), timezone).dayISO;
    const todayStart = dayWindow(todayKey, timezone).start;

    // جمع‌های روز از پایگاه داده می‌آیند (نه از صفحهٔ جاری) تا با صفحه‌بندی درست بمانند
    const [entries, total, todayAgg] = await Promise.all([
      prisma.cashRegisterEntry.findMany({
        where: entriesWhere,
        include: { branch: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.cashRegisterEntry.count({ where: entriesWhere }),
      prisma.cashRegisterEntry.aggregate({
        where: { salonId: id, createdAt: { gte: todayStart } },
        _sum: { cashAmount: true, cardAmount: true, onlineAmount: true, expenseAmount: true },
      }),
    ]);

    const t = todayAgg._sum;
    const cash = t.cashAmount ?? 0;
    const card = t.cardAmount ?? 0;
    const online = t.onlineAmount ?? 0;
    const expense = t.expenseAmount ?? 0;

    return json({
      success: true,
      entries,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      todayTotals: {
        cash,
        card,
        online,
        expense,
        net: cash + card + online - expense,
      },
      // O8: روز و منطقه‌زمانی مبنای جمع‌ها اعلام می‌شود تا فهرست «امروز» قابل‌افسون‌گاری باشد
      today: todayKey,
      timezone,
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
