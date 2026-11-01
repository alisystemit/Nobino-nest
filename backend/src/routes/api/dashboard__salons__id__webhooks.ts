// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/webhooks/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { json, apiError, getPagination } from "@/lib/utils";

const createSchema = z.object({
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.string()).min(1),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const { page, limit, skip, take } = getPagination(_req.url, 50, 200);
    const where = { salonId: id };
    const [webhooks, total] = await Promise.all([
      prisma.webhookConfig.findMany({ where, orderBy: [{ id: "asc" }], skip, take }),
      prisma.webhookConfig.count({ where }),
    ]);
    return json({ success: true, webhooks, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
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
    // سقف تعداد وب‌هوک پلن (در پلن رایگان صفر است؛ کلید api هم باید فعال باشد)
    await assertLimit({ salonId: id }, "api");
    await assertLimit({ salonId: id }, "webhooks");
    const webhook = await prisma.webhookConfig.create({ data: { salonId: id, ...body } });
    return json({ success: true, webhook }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
