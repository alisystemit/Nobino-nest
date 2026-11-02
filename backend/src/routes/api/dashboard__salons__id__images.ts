// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/images/route.ts — بدون تغییر منطق
// سقف حجم از تنظیمات پویای سوپرادمین خوانده می‌شود (کلید upload.image_max_mb).
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { storeFile } from "@/lib/storage";
import { checkLimit } from "@/lib/plans/limits";
import { uploadLimits, sizeLimitFa } from "@/lib/upload-limits";
import { json, apiError, getPagination } from "@/lib/utils";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "image/avif"];

/**
 * بارگذاری تصویر سالن (لوگو، بنر یا گالری).
 * multipart/form-data: file + kind = logo | banner | gallery + title (اختیاری)
 */
export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const salon = await prisma.salon.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "gallery");
    const title = String(form.get("title") ?? "").trim() || null;

    if (!(file instanceof File)) {
      return json({ success: false, error: "فایلی ارسال نشده است" }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return json({ success: false, error: "فرمت تصویر مجاز نیست (JPG، PNG، WebP، GIF یا SVG)" }, { status: 400 });
    }
    const { imageMaxBytes } = await uploadLimits();
    if (file.size > imageMaxBytes) {
      return json({ success: false, error: sizeLimitFa(Math.round(imageMaxBytes / (1024 * 1024))) }, { status: 400 });
    }
    if (!["logo", "banner", "gallery"].includes(kind)) {
      return json({ success: false, error: "نوع تصویر نامعتبر است" }, { status: 400 });
    }

    if (kind === "gallery") {
      // سقف گالری از ماتریس محدودیت‌های پلن خوانده می‌شود (نه عدد ثابت در کد)
      const [gallery, webapp] = await Promise.all([
        checkLimit({ salonId: id }, "galleryItems"),
        checkLimit({ salonId: id }, "webapp"),
      ]);
      if (!webapp.allowed) return json({ success: false, error: webapp.message }, { status: 403 });
      if (!gallery.allowed) return json({ success: false, error: gallery.message }, { status: 402 });
    }

    const stored = await storeFile(file, { dir: "uploads" });

    if (kind === "logo" || kind === "banner") {
      await prisma.salon.update({
        where: { id },
        data: kind === "logo" ? { logoUrl: stored.url } : { bannerUrl: stored.url },
      });
      return json({ success: true, url: stored.url, kind });
    }

    const item = await prisma.galleryItem.create({
      data: { salonId: id, imageUrl: stored.url, title },
    });
    return json({ success: true, url: stored.url, kind, item }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

/** حذف تصویر گالری */
export async function DELETE(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const url = new URL(req.url);
    const itemId = url.searchParams.get("itemId");
    if (!itemId) return json({ success: false, error: "شناسه تصویر الزامی است" }, { status: 400 });

    const item = await prisma.galleryItem.findFirst({ where: { id: itemId, salonId: id } });
    if (!item) return json({ success: false, error: "تصویر یافت نشد" }, { status: 404 });

    await prisma.galleryItem.delete({ where: { id: item.id } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}

/** فهرست تصاویر گالری سالن */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const { page, limit, skip, take } = getPagination(_req.url, 100, 500);
    const [items, galleryTotal, salon, { imageMaxBytes }] = await Promise.all([
      prisma.galleryItem.findMany({ where: { salonId: id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }], skip, take }),
      prisma.galleryItem.count({ where: { salonId: id } }),
      prisma.salon.findUnique({ where: { id }, select: { logoUrl: true, bannerUrl: true } }),
      uploadLimits(),
    ]);
    return json({
      success: true,
      items,
      logoUrl: salon?.logoUrl ?? null,
      bannerUrl: salon?.bannerUrl ?? null,
      maxMb: Math.round(imageMaxBytes / (1024 * 1024)),
      total: galleryTotal,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(galleryTotal / limit)),
    });
  } catch (err) {
    return apiError(err);
  }
}
