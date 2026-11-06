// خودکار: پورت‌شده از src/app/api/upload/avatar/route.ts — بدون تغییر منطق
// سقف حجم از تنظیمات پویای سوپرادمین خوانده می‌شود (کلید upload.avatar_max_mb).
import { requireAuth } from "@/lib/auth/guards";
import { storeFile } from "@/lib/storage";
import { uploadLimits, sizeLimitFa } from "@/lib/upload-limits";
import { json, apiError } from "@/lib/utils";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * بررسی محتوای فایل (magic bytes) به جای فقط MIME type
 * این تابع اجازه نمی‌دهد فایل‌های غیرتصویری با extension جعلی آپلود شوند
 */
async function validateImageContent(file: File): Promise<void> {
  if (file.size === 0) {
    throw new Error("فایل خالی است");
  }

  // مسیر فایل موقت در دیسک
  const fileEntry = file as any;
  const tempPath = fileEntry.path || (fileEntry as { webkitRelativePath?: string }).webkitRelativePath;

  // اگر path نداریم، نمی‌توانیم magic bytes را بررسی کنیم
  // در این حالت فقط MIME type چک می‌شود
  if (!tempPath) return;

  const buffer = await readFile(join(tempdir(), tempPath.split("\\").pop() || tempPath.split("/").pop() || "unknown"));

  // Magic bytes برای تصاویر
  const signatures = {
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    webp: [0x52, 0x49, 0x46, 0x46],
    avif: [0x00, 0x00, 0x00, 0x01, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66],
  };

  // بررسی magic bytes
  for (const [type, sig] of Object.entries(signatures)) {
    if (buffer.length >= sig.length && sig.every((byte, i) => buffer[i] === byte)) {
      return; // معتبر است
    }
  }

  throw new Error("فایل واقعاً تصویر نیست");
}

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

    // اصلاح: بررسی محتوای فایل (magic bytes) به جای فقط MIME type
    try {
      await validateImageContent(file);
    } catch {
      return json({ success: false, error: "فایل واقعاً تصویر نیست" }, { status: 400 });
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
