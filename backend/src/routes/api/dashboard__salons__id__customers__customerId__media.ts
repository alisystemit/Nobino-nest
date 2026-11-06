import { requireSalonManage } from "@/lib/auth/guards";
import { crmLimits, crmLimitsPayload } from "@/lib/crm-limits";
import { prisma } from "@/lib/prisma";
import { storeFile, removeLocalFile } from "@/lib/storage";
import { json, apiError } from "@/lib/utils";
import {
  normalizeMime,
  validateAudioContent,
  validateImageContent,
  type AudioMime,
  type ImageMime,
} from "@/lib/upload-validation";

const PHOTO_TYPES: readonly ImageMime[] = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const VOICE_TYPES: readonly AudioMime[] = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

async function isCustomerOfSalon(salonId: string, customerId: string) {
  const customer = await prisma.salonCustomer.findUnique({ where: { id: customerId }, select: { salonId: true } });
  return Boolean(customer && customer.salonId === salonId);
}

/** فهرست عکس‌ها و پیام‌های صوتی پروندهٔ مشتری + سقف‌های جاری پنل */
export async function GET(
  _req: Request,
  { params }: { params: { id: string; customerId: string } | Promise<{ id: string; customerId: string }> },
) {
  try {
    const { id, customerId } = await params;
    await requireSalonManage(id);
    if (!(await isCustomerOfSalon(id, customerId))) return json({ success: false, error: "customer not found" }, { status: 404 });
    const [media, limits] = await Promise.all([
      prisma.salonCustomerMedia.findMany({
        where: { salonId: id, customerId },
        orderBy: { createdAt: "desc" },
      }),
      crmLimits(),
    ]);
    // سقف‌ها کامل برگردانده می‌شوند (تعداد + حجم)، تا رابط کاربری بتواند
    // پیش از ارسال، حجم فایل و طول ضبط را از همان مقدار پنل بخواند.
    const p = crmLimitsPayload(limits);
    return json({
      success: true,
      media,
      limit: p.mediaLimit,
      limits: p,
      ...p,
    });
  } catch (err) {
    return apiError(err);
  }
}

/** بارگذاری عکس یا پیام صوتی (سقف تعداد و حجم از تنظیمات سوپرادمین) */
export async function POST(
  req: Request,
  { params }: { params: { id: string; customerId: string } | Promise<{ id: string; customerId: string }> },
) {
  try {
    const { id, customerId } = await params;
    await requireSalonManage(id);
    if (!(await isCustomerOfSalon(id, customerId))) return json({ success: false, error: "customer not found" }, { status: 404 });

    const limits = await crmLimits();
    if (!limits.mediaEnabled) {
      return json({ success: false, error: "بارگذاری عکس و ویس در پروندهٔ مشتری از سمت پنل غیرفعال شده است." }, { status: 403 });
    }

    // سقف حجم پیش از پارس multipart (نوع فایل هنوز معلوم نیست ⇒ بزرگ‌ترین سقف)
    const hardMax = Math.max(limits.photoMaxBytes, limits.voiceMaxBytes);
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > hardMax + 1024 * 1024) {
      return json(
        { success: false, error: `حجم فایل باید کمتر از ${Math.round(hardMax / (1024 * 1024))} مگابایت باشد` },
        { status: 413 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ success: false, error: "فایلی ارسال نشده است" }, { status: 400 });

    const isPhoto = PHOTO_TYPES.includes(normalizeMime(file.type) as ImageMime);
    const isVoice = VOICE_TYPES.includes(normalizeMime(file.type) as AudioMime);
    if (!isPhoto && !isVoice) {
      return json({ success: false, error: "فقط تصویر (JPG/PNG/WebP/GIF) یا فایل صوتی (MP3/WAV/OGG/WebM) مجاز است" }, { status: 400 });
    }
    const maxBytes = isPhoto ? limits.photoMaxBytes : limits.voiceMaxBytes;
    const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    if (file.size > maxBytes) {
      return json(
        { success: false, error: isPhoto ? `حجم عکس باید کمتر از ${maxMb} مگابایت باشد` : `حجم فایل صوتی باید کمتر از ${maxMb} مگابایت باشد` },
        { status: 400 },
      );
    }

    // محتوای واقعی فایل باید با نوع ادعاشده بخواند (نه HTML/JS با پسوند jpg)
    let storedMime: string;
    try {
      storedMime = isPhoto
        ? await validateImageContent(file, PHOTO_TYPES)
        : await validateAudioContent(file, VOICE_TYPES);
    } catch {
      return json({ success: false, error: "محتوای فایل با نوع اعلام‌شده هم‌خوان نیست" }, { status: 400 });
    }

    const count = await prisma.salonCustomerMedia.count({ where: { salonId: id, customerId } });
    if (count >= limits.mediaLimit) {
      return json({ success: false, error: `حداکثر ${limits.mediaLimit} فایل برای هر مشتری مجاز است. ابتدا یکی را حذف کنید.` }, { status: 400 });
    }

    const stored = await storeFile(file, { dir: "uploads/customers", mime: storedMime });
    const media = await prisma.salonCustomerMedia.create({
      data: {
        salonId: id,
        customerId,
        type: isVoice ? "voice" : "photo",
        url: stored.url,
        name: file.name || null,
        mimeType: file.type || null,
        size: file.size,
      },
    });
    return json({ success: true, media }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

/** حذف فایل ضمیمه — فقط در محدودهٔ همان سالن */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; customerId: string } | Promise<{ id: string; customerId: string }> },
) {
  try {
    const { id, customerId } = await params;
    await requireSalonManage(id);
    const mediaId = new URL(req.url).searchParams.get("mediaId");
    if (!mediaId) return json({ success: false, error: "شناسه فایل الزامی است" }, { status: 400 });

    const media = await prisma.salonCustomerMedia.findFirst({ where: { id: mediaId, salonId: id, customerId } });
    if (!media) return json({ success: false, error: "فایل یافت نشد" }, { status: 404 });
    await prisma.salonCustomerMedia.delete({ where: { id: media.id } });
    if (media.url.startsWith("/uploads/")) await removeLocalFile(media.url.slice(1));
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
