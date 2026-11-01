// خودکار: پورت‌شده از src/app/api/cron/holds/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { requireCronAuth } from "@/lib/auth/cron-guard";
import { json } from "@/lib/utils";
import { HOLD_MARKER } from "@/lib/markers";

/** پاک‌سازی قفل‌های موقت منقضی‌شده (آزادسازی بازه) */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const del = await prisma.appointment.deleteMany({
    where: { note: HOLD_MARKER, tempLockExpiresAt: { lt: new Date() } },
  });

  return json({ success: true, expiredCleared: del.count });
}
