// خودکار: پورت‌شده از src/app/api/upload/avatar/route.ts — بدون تغییر منطق
// سقف حجم از تنظیمات پویای سوپرادمین خوانده می‌شود (کلید upload.avatar_max_mb).
import { requireAuth } from "@/lib/auth/guards";
import { storeFile } from "@/lib/storage";
import { uploadLimits, sizeLimitFa } from "@/lib/upload-limits";
import { json, apiError } from "@/lib/utils";
import { normalizeMime, validateImageContent, type ImageMime } from "@/lib/upload-validation";

const ALLOWED: readonly ImageMime[] = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * بارگذاری تصویر پروفایل/آواتار (کاربر یا کارمند).
 * multipart/form-data: file
 * خروجی: { success, url }
 */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireAuth();

    // سقف حجم پیش از پارس multipart (سربار فرم تا ۱ مگابایت لحاظ می‌شود)
    const { avatarMaxBytes } = await uploadLimits();
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > avatarMaxBytes + 1024 * 1024) {
      return json({ success: false, error: sizeLimitFa(Math.round(avatarMaxBytes / (1024 * 1024))) }, { status: 413 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return json({ success: false, error: "فایلی ارسال نشده است" }, { status: 400 });
    }
    if (!ALLOWED.includes(normalizeMime(file.type) as ImageMime)) {
      return json({ success: false, error: "فرمت تصویر مجاز نیست (JPG، PNG، WebP یا AVIF)" }, { status: 400 });
    }

    // سقف حجم واقعی فایل
    if (file.size > avatarMaxBytes) {
      return json({ success: false, error: sizeLimitFa(Math.round(avatarMaxBytes / (1024 * 1024))) }, { status: 400 });
    }

    // بررسی محتوای واقعی فایل (magic bytes)؛ پسوند ذخیره‌سازی از همین MIME گرفته می‌شود
    let detected: ImageMime;
    try {
      detected = await validateImageContent(file, ALLOWED);
    } catch {
      return json({ success: false, error: "فایل واقعاً تصویر نیست" }, { status: 400 });
    }

    const stored = await storeFile(file, { dir: "uploads/avatars", mime: detected });
    return json({ success: true, url: stored.url }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
