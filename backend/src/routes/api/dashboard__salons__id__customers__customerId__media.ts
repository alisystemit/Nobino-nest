import { requireSalonManage } from "@/lib/auth/guards";
import { crmLimits } from "@/lib/crm-limits";
import { prisma } from "@/lib/prisma";
import { storeFile, removeLocalFile } from "@/lib/storage";
import { json, apiError } from "@/lib/utils";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const VOICE_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/m4a", "audio/aac"];

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
    return json({ success: true, media, limit: limits.mediaLimit, limits: { mediaLimit: limits.mediaLimit, mediaEnabled: limits.mediaEnabled } });
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

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ success: false, error: "فایلی ارسال نشده است" }, { status: 400 });

    const isPhoto = PHOTO_TYPES.includes(file.type);
    const isVoice = VOICE_TYPES.includes(file.type);
    if (!isPhoto && !isVoice) {
      return json({ success: false, error: "فقط تصویر (JPG/PNG/WebP) یا فایل صوتی (MP3/WAV/OGG) مجاز است" }, { status: 400 });
    }
    const maxBytes = isPhoto ? limits.photoMaxBytes : limits.voiceMaxBytes;
    const maxMb = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    if (file.size > maxBytes) {
      return json(
        { success: false, error: isPhoto ? `حجم عکس باید کمتر از ${maxMb} مگابایت باشد` : `حجم فایل صوتی باید کمتر از ${maxMb} مگابایت باشد` },
        { status: 400 },
      );
    }

    const count = await prisma.salonCustomerMedia.count({ where: { salonId: id, customerId } });
    if (count >= limits.mediaLimit) {
      return json({ success: false, error: `حداکثر ${limits.mediaLimit} فایل برای هر مشتری مجاز است. ابتدا یکی را حذف کنید.` }, { status: 400 });
    }

    const stored = await storeFile(file, { dir: "uploads/customers" });
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
