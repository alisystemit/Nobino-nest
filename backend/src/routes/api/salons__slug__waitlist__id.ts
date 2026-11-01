// خودکار: پورت‌شده از src/app/api/salons/[slug]/waitlist/[id]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";

const schema = z.object({ status: z.enum(["WAITING", "NOTIFIED", "BOOKED", "EXPIRED"]) });

export async function PATCH(req: Request, { params }: { params: { slug: string; id: string } | Promise<{ slug: string; id: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { slug, id } = await params;
    const body = schema.parse(await req.json());

    const salon = await prisma.salon.findUnique({ where: { slug } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }

    const entry = await prisma.waitlistEntry.findUnique({ where: { id } });
    if (!entry || entry.salonId !== salon.id) return json({ success: false, error: "مورد یافت نشد" }, { status: 404 });

    const updated = await prisma.waitlistEntry.update({ where: { id }, data: { status: body.status } });
    return json({ success: true, entry: updated });
  } catch (err) {
    return apiError(err);
  }
}
