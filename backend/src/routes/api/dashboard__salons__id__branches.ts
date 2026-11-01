// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/branches/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().min(1),
  city: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id } = await params;
    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }
    const branches = await prisma.branch.findMany({ where: { salonId: id }, include: { _count: { select: { staff: true, appointments: true } } }, orderBy: { createdAt: "asc" } });
    return json({ success: true, branches });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id } = await params;
    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }
    await assertLimit({ salonId: id }, "branches");

    const body = createSchema.parse(await req.json());
    const branch = await prisma.branch.create({ data: { salonId: id, ...body } });
    return json({ success: true, branch }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
