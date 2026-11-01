// خودکار: پورت‌شده از src/app/api/admin/support/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { enqueueInApp, enqueueSms } from "@/lib/notifications/queue";
import { json, apiError } from "@/lib/utils";

/** فهرست شکایت‌ها/درخواست‌های پشتیبانی برای سوپرادمین */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";

    const where: Record<string, unknown> = {};
    if (status === "OPEN" || status === "IN_PROGRESS" || status === "CLOSED") where.status = status;
    if (q) {
      where.OR = [
        { subject: { contains: q, mode: "insensitive" } },
        { message: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ];
    }

    const [tickets, counts] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200,
        include: { user: { select: { id: true, phone: true, name: true, role: true } } },
      }),
      prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const summary = { OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 } as Record<string, number>;
    for (const c of counts) summary[c.status] = c._count._all;

    return json({ success: true, tickets, summary });
  } catch (err) {
    return apiError(err);
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  adminReply: z.string().max(2000).optional(),
});

/** پاسخ/تغییر وضعیت درخواست پشتیبانی */
export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const admin = await requireRole(["ADMIN"]);
    const body = patchSchema.parse(await req.json());

    const before = await prisma.supportTicket.findUnique({ where: { id: body.id } });
    if (!before) return json({ success: false, error: "درخواست یافت نشد" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.priority) data.priority = body.priority;
    if (body.adminReply !== undefined) {
      data.adminReply = body.adminReply.trim() || null;
      if (body.adminReply.trim()) {
        data.repliedAt = new Date();
        data.repliedById = admin.id;
      }
    }
    if (Object.keys(data).length === 0) {
      return json({ success: false, error: "تغییری ارسال نشده است" }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.update({ where: { id: body.id }, data });

    // اطلاع‌رسانی به کاربر (درون‌برنامه‌ای + پیامک در صورت وجود شماره واقعی)
    if (body.adminReply?.trim() && before.userId) {
      const uniqueKey = `support-reply:${ticket.id}:${Date.now()}`;
      await enqueueInApp({
        type: "SUPPORT_REPLY",
        userId: before.userId,
        message: `پاسخ پشتیبانی به «${before.subject}»: ${body.adminReply.trim().slice(0, 300)}`,
        uniqueKey,
      }).catch(() => {});
      if (before.phone && !before.phone.startsWith("email:")) {
        await enqueueSms({
          type: "SUPPORT_REPLY",
          recipient: before.phone,
          message: `پاسخ پشتیبانی نوبینو به «${before.subject}»: ${body.adminReply.trim().slice(0, 200)}`,
          uniqueKey,
        }).catch(() => {});
      }
    }

    await logAudit({
      actorId: admin.id,
      actorPhone: admin.phone,
      action: "support_ticket_update",
      entityType: "SupportTicket",
      entityId: ticket.id,
      before: { status: before.status, priority: before.priority },
      after: { status: ticket.status, priority: ticket.priority, replied: !!body.adminReply?.trim() },
    });

    return json({ success: true, ticket });
  } catch (err) {
    return apiError(err);
  }
}

