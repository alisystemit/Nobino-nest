// خودکار: پورت‌شده از src/app/api/favorites/[salonId]/route.ts — بدون تغییر منطق
import { requireAuth } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

export async function POST(_req: Request, { params }: { params: { salonId: string } | Promise<{ salonId: string }> }) {
  try {
    const user = await requireAuth();
    const { salonId } = await params;

    const salon = await prisma.salon.findUnique({ where: { id: salonId } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

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
