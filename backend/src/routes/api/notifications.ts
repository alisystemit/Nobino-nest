// خودکار: پورت‌شده از src/app/api/notifications/route.ts — بدون تغییر منطق


import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination } from "@/lib/utils";

/** لیست اعلان‌های داخل برنامه‌ای کاربر جاری — صفحه‌بندی‌شده */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const { page, limit, skip, take } = getPagination(_req.url, 20, 100);
    const where = { userId: user.id, channel: "IN_APP" as const };
    const [notifications, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return json({ success: true, notifications, total, unread, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}

/** علامت‌گذاری همه به‌عنوان خوانده‌شده */
export async function PATCH(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    await prisma.notification.updateMany({
      where: { userId: user.id, channel: "IN_APP", readAt: null },
      data: { readAt: new Date() },
    });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
