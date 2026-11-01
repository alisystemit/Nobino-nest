// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/staff/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  role: z.enum(["OWNER", "MANAGER", "RECEPTION", "STYLIST"]).default("STYLIST"),
  commissionPercent: z.number().int().min(0).max(100).default(0),
  branchId: z.string().optional(),
  userId: z.string().optional(),
  bio: z.string().optional(),
  avatarUrl: z.string().optional(),
  specialties: z.array(z.string()).default([]),
  schedule: z.any().optional(),
  serviceIds: z.array(z.string()).optional(),
});

async function assertSalonAccess(user: { role: string; id: string }, salonId: string) {
  const salon = await prisma.salon.findUnique({ where: { id: salonId } });
  if (!salon) return null;
  if (user.role !== "ADMIN" && salon.ownerId !== user.id) return null;
  return salon;
}

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id } = await params;
    const salon = await assertSalonAccess(user, id);
    if (!salon) return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });

    const staff = await prisma.staff.findMany({
      where: { salonId: id },
      include: { services: true, _count: { select: { appointments: true } } },
      orderBy: { createdAt: "asc" },
    });
    return json({ success: true, staff });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { id } = await params;
    const salon = await assertSalonAccess(user, id);
    if (!salon) return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });

    const body = createSchema.parse(await req.json());

    // رعایت محدودیت پلن (تعداد آرایشگران) — پیام دقیق از ماتریس محدودیت‌ها می‌آید
    await assertLimit({ salonId: id }, "staff");

    const staff = await prisma.staff.create({
      data: {
        salonId: id,
        name: body.name,
        title: body.title,
        role: body.role,
        commissionPercent: body.commissionPercent,
        branchId: body.branchId,
        userId: body.userId,
        bio: body.bio,
        avatarUrl: body.avatarUrl,
        specialties: body.specialties,
        schedule: body.schedule,
        services: body.serviceIds ? { connect: body.serviceIds.map((sid) => ({ id: sid })) } : undefined,
      },
      include: { services: true, branch: true },
    });

    return json({ success: true, staff }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
