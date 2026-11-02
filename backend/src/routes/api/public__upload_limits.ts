// سقف‌های پویای بارگذاری فایل — عمومی (بدون احراز هویت)
// مقادیر از پنل سوپرادمین (تنظیمات سیستم > «بارگذاری فایل» و «پروندهٔ مشتریان»)
// خوانده می‌شوند و این endpoint فقط عدد مگابایت را برای راهنما/پیش‌بررسی کلاینت می‌دهد.
import { uploadLimits, uploadLimitsPayload } from "@/lib/upload-limits";
import { crmLimits, crmLimitsPayload } from "@/lib/crm-limits";
import { json } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  const [upload, crm] = await Promise.all([uploadLimits(), crmLimits()]);
  return json({
    success: true,
    ...uploadLimitsPayload(upload),
    crm: {
      ...crmLimitsPayload(crm),
      noteLimit: crm.noteLimit,
      mediaLimit: crm.mediaLimit,
    },
  });
}
