// خودکار: پورت‌شده از src/app/api/favorites/[salonId]/route.ts — بدون تغییر منطق
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, httpError } from "@/lib/utils";

/**
 * C18: سقف علاقه‌مندی قبلاً فقط در کلاینت بود (`MAX_FAVORITES` در مینی‌اپ)، پس هر
 * درخواست مستقیم API می‌توانست بی‌نهایت ردیف بسازد. عدد باید اینجا هم رعایت شود و
 * با همان مقدار کلاینت یکی باشد (۲۰).
 */
export const MAX_FAVORITES_PER_USER = 20;

export async function POST(_req: Request, { params }: { params: { salonId: string } | Promise<{ salonId: string }> }) {
  try {
    const user = await requireAuth();
    const { salonId } = await params;

    const salon = await prisma.salon.findUnique({
      where: { id: salonId },
      select: { id: true, isActive: true, isApproved: true },
    });
    // فقط سالنی که واقعاً در دسترس مشتریان است قابل علاقه‌مندی است
    if (!salon || !salon.isActive || !salon.isApproved) {
      return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    }

    const already = await prisma.favorite.findUnique({ where: { userId_salonId: { userId: user.id, salonId } } });
    if (!already) {
      const count = await prisma.favorite.count({ where: { userId: user.id } });
      if (count >= MAX_FAVORITES_PER_USER) {
        throw httpError(`فهرست علاقه‌مندی شما کامل است (حداکثر ${MAX_FAVORITES_PER_USER} سالن). ابتدا یکی را حذف کنید.`, 400);
      }
    }

    const fav = await prisma.favorite.upsert({
      where: { userId_salonId: { userId: user.id, salonId } },
      update: {},
      create: { userId: user.id, salonId },
    });

    return json({ success: true, favorite: fav }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { salonId: string } | Promise<{ salonId: string }> }) {
  try {
    const user = await requireAuth();
    const { salonId } = await params;
    await prisma.favorite.deleteMany({ where: { userId: user.id, salonId } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
