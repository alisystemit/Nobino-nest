// خودکار: پورت‌شده از src/app/api/admin/broadcast/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { enqueueSms, processPendingNotifications } from "@/lib/notifications/queue";
import { logAudit } from "@/lib/audit";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  message: z.string().min(1).max(600),
  audience: z.enum(["ALL_SALONS", "SALON_OWNERS", "ACTIVE_SUBS"]).default("ALL_SALONS"),
});

/** ارسال پیامک سراسری به همه سالن‌ها / مالکان / مشترکین فعال */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = schema.parse(await req.json());

    let phones: string[] = [];
    if (body.audience === "ACTIVE_SUBS") {
      const subs = await prisma.subscription.findMany({ where: { status: "ACTIVE" }, select: { salon: { select: { phone: true } } } });
      phones = [...new Set(subs.map((s) => s.salon.phone).filter(Boolean))];
    } else {
      const salons = await prisma.salon.findMany({
        where: body.audience === "SALON_OWNERS" ? {} : { isActive: true },
        select: { phone: true, owner: { select: { phone: true } } },
      });
      phones = [...new Set(salons.flatMap((s) => [s.phone, s.owner?.phone]).filter(Boolean))];
    }

    const uniqueKey = `bcast:${Date.now()}`;
    let queued = 0;
    for (const phone of phones) {
      await enqueueSms({ type: "BROADCAST", recipient: phone, message: body.message, uniqueKey: `${uniqueKey}:${phone}` });
      queued++;
    }
    await processPendingNotifications(50).catch(() => {});
    await logAudit({ actorId: user.id, actorPhone: user.phone, action: "broadcast", entityType: "System", after: { audience: body.audience, recipients: queued } });

    return json({ success: true, queued });
  } catch (err) {
    return apiError(err);
  }
}

