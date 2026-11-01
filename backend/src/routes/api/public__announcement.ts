// خودکار: پورت‌شده از src/app/api/public/announcement/route.ts — بدون تغییر منطق
import { getSetting } from "@/lib/settings";
import { json } from "@/lib/utils";

/** اعلان سراسری (قابل تنظیم توسط ادمین) — عمومی */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  const text = await getSetting("general.announcement");
  return json({ success: true, announcement: text?.trim() || null });
}
