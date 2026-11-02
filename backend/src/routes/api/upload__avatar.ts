// خودکار: پورت‌شده از src/app/api/upload/avatar/route.ts — بدون تغییر منطق
// سقف حجم از تنظیمات پویای سوپرادمین خوانده می‌شود (کلید upload.avatar_max_mb).
import { requireAuth } from "@/lib/auth/guards";
import { storeFile } from "@/lib/storage";
import { uploadLimits, sizeLimitFa } from "@/lib/upload-limits";
import { json, apiError } from "@/lib/utils";


const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * بارگذاری تصویر پروفایل/آواتار (کاربر یا کارمند).
 * multipart/form-data: file
 * خروجی: { success, url }
 */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireAuth();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ success: false, error: "فایلی ارسال نشده است" }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return json({ success: false, error: "فرمت تصویر مجاز نیست (JPG، PNG یا WebP)" }, { status: 400 });
    }
    const { avatarMaxBytes } = await uploadLimits();
    if (file.size > avatarMaxBytes) {
      return json({ success: false, error: sizeLimitFa(Math.round(avatarMaxBytes / (1024 * 1024))) }, { status: 400 });
    }

    const stored = await storeFile(file, { dir: "uploads/avatars" });
    return json({ success: true, url: stored.url }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
