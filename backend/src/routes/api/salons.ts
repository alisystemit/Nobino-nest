// خودکار: پورت‌شده از src/app/api/salons/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "اسلاگ فقط حروف کوچک انگلیسی، عدد و خط تیره"),
  phone: z.string().min(6),
  email: z.string().email().optional().or(z.literal("")),
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
  mapUrl: z.string().optional(),
  baladUrl: z.string().optional(),
  neshanUrl: z.string().optional(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  coverColor: z.string().default("#ec4899"),
});

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const salons = await prisma.salon.findMany({
      where: user.role === "ADMIN" ? {} : { ownerId: user.id },
      include: { services: true, _count: { select: { appointments: true } } },
    });
    return json({ success: true, salons });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const body = createSchema.parse(await req.json());

    const existing = await prisma.salon.findUnique({ where: { slug: body.slug } });
    if (existing) return json({ success: false, error: "این اسلاگ قبلاً استفاده شده است" }, { status: 409 });

    const existingCount = await prisma.salon.count({ where: { ownerId: user.id } });
    // سقف «تعداد سالن هر کاربر» از ماتریس محدودیت‌های پلن خوانده می‌شود (سوپرادمین مستثنا)
    if (user.role !== "ADMIN") await assertLimit({ userId: user.id }, "salons");
    const salon = await prisma.salon.create({
      data: {
        name: body.name,
        slug: body.slug,
        phone: body.phone,
        email: body.email || null,
        whatsapp: body.whatsapp,
        instagram: body.instagram,
        website: body.website,
        city: body.city,
        address: body.address,
        description: body.description,
        mapUrl: body.mapUrl,
        baladUrl: body.baladUrl,
        neshanUrl: body.neshanUrl,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        coverColor: body.coverColor,
        ownerId: user.id,
        isApproved: user.role === "ADMIN",
        // دوره آزمایشی ۱۴ روزه برای اولین سالن
        trialEndsAt: existingCount === 0 ? new Date(Date.now() + 14 * 864e5) : null,
      },
    });

    return json({ success: true, salon }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

