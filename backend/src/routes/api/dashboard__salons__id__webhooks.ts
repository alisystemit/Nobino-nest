// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/webhooks/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { json, apiError, getPagination } from "@/lib/utils";
import { assertWebhookUrl, maskSecret } from "@/lib/webhook-target";

const createSchema = z.object({
  url: z.string().max(500),
  secret: z.string().min(8).max(200).optional(),
  events: z.array(z.string().min(3).max(60)).min(1).max(20),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const { page, limit, skip, take } = getPagination(_req.url, 50, 200);
    const where = { salonId: id };
    const [rows, total] = await Promise.all([
      prisma.webhookConfig.findMany({ where, orderBy: [{ id: "asc" }], skip, take }),
      prisma.webhookConfig.count({ where }),
    ]);
    // O7: راز وب‌هوک فقط برای امضای سمت سرویس‌گیرنده لازم است؛ برگرداندن
    // متن خام آن در فهرست، کل امنیت رویدادها را بی‌اثر می‌کرد.
    const webhooks = rows.map((w) => ({ ...w, secret: maskSecret(w.secret), hasSecret: !!w.secret }));
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
    // O7: جلوگیری از SSRF — آدرس باید http(s) عمومی باشد (در حالت توسعه حلقهٔ بازگشتی آزاد است)
    const url = assertWebhookUrl(body.url);
    // سقف تعداد وب‌هوک پلن (در پلن رایگان صفر است؛ کلید api هم باید فعال باشد)
    await assertLimit({ salonId: id }, "api");
    await assertLimit({ salonId: id }, "webhooks");
    const webhook = await prisma.webhookConfig.create({ data: { salonId: id, url, secret: body.secret, events: body.events } });
    return json({ success: true, webhook: { ...webhook, secret: maskSecret(webhook.secret), hasSecret: !!webhook.secret } }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
