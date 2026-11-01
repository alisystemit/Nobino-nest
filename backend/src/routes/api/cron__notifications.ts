// خودکار: پورت‌شده از src/app/api/cron/notifications/route.ts — بدون تغییر منطق
import { requireCronAuth } from "@/lib/auth/cron-guard";
import { processPendingNotifications } from "@/lib/notifications/queue";
import { json } from "@/lib/utils";

/** پردازش صف پیامک (با تلاش مجدد) — قابل صدا زدن از Cron یا دستی */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const denied = await requireCronAuth(req);
  if (denied) return denied;
  const result = await processPendingNotifications(50);
  return json({ success: true, ...result });
}
