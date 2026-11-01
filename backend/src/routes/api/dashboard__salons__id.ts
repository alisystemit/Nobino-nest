// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(6).optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  whatsapp: z.string().optional().nullable(),
  instagram: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  city: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  mapUrl: z.string().optional().nullable(),
  baladUrl: z.string().optional().nullable(),
  neshanUrl: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  bannerUrl: z.string().optional().nullable(),
  coverColor: z.string().optional(),
  timezone: z.string().optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  customDomain: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  minNoticeMinutes: z.number().int().min(0).optional(),
  maxAdvanceDays: z.number().int().min(1).optional(),
  cancelDeadlineHours: z.number().int().min(0).optional(),
  bufferMinutes: z.number().int().min(0).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = patchSchema.parse(await req.json());

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    const data: Record<string, unknown> = { ...body };
    if (body.customDomain && body.customDomain !== salon.customDomain) {
      data.customDomain = body.customDomain.toLowerCase();
      data.domainToken = `nobino-verify-${randomUUID()}`;
      data.domainStatus = "PENDING";
    }

    const updated = await prisma.salon.update({ where: { id }, data });
    return json({ success: true, salon: updated });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    await prisma.salon.delete({ where: { id } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
