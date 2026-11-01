// خودکار: پورت‌شده از src/app/api/notifications/route.ts — بدون تغییر منطق


import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** لیست اعلان‌های داخل برنامه‌ای کاربر جاری */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id, channel: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return json({ success: true, notifications });
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
