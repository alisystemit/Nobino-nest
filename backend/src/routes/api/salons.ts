// خودکار: پورت‌شده از src/app/api/salons/route.ts — بدون تغییر منطق


import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { ensureUniqueSlug, slugCandidates } from "@/lib/slug";
import { json, apiError, getPagination } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "اسلاگ فقط حروف کوچک انگلیسی، عدد و خط تیره").optional(),
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
  salonType: z.enum(["WOMEN", "MEN", "COUPLE"]).default("WOMEN"),
});

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { page, limit, skip, take } = getPagination(_req.url, 50, 200);
    const url = new URL(_req.url);
    const q = url.searchParams.get("q")?.trim();
    const city = url.searchParams.get("city")?.trim();
    const sort = url.searchParams.get("sort")?.trim();
    const type = url.searchParams.get("type")?.trim().toUpperCase();

    const where: Prisma.SalonWhereInput = user.role === "ADMIN" ? {} : { ownerId: user.id };
    if (type === "MEN" || type === "WOMEN" || type === "COUPLE") where.salonType = type;
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { slug: { contains: q } },
        { city: { contains: q } },
        { phone: { contains: q } },
      ];
    }
    if (city) where.city = city;

    // ترتیب پایدار برای صفحه‌بندی لازم است (وگرنه رکوردها بین صفحه‌ها تکراری/جا‌مانده می‌شوند)
    let orderBy: Prisma.SalonOrderByWithRelationInput = { createdAt: "desc" };
    if (sort === "name") orderBy = { name: "asc" };
    else if (sort === "old") orderBy = { createdAt: "asc" };
    else if (sort === "busy") orderBy = { appointments: { _count: "desc" } };

    const [salons, total] = await Promise.all([
      prisma.salon.findMany({
        where,
        include: { services: true, _count: { select: { appointments: true } } },
        orderBy: [orderBy, { id: "asc" }],
        skip,
        take,
      }),
      prisma.salon.count({ where }),
    ]);
    return json({ success: true, salons, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const body = createSchema.parse(await req.json());

    // اسلاگ الزامی نیست؛ اگر ارسال نشود، از نام سالن (فینگلیش) به‌صورت خودکار ساخته می‌شود
    const existing = body.slug
      ? await prisma.salon.findUnique({ where: { slug: body.slug } })
      : null;
    if (body.slug && existing) return json({ success: false, error: "این اسلاگ قبلاً استفاده شده است" }, { status: 409 });

    const slug = body.slug ?? (await (async () => {
      // پیش‌بارگذاری یکجا برای بررسی هم‌زمان (ensureUniqueSlug همزمان است)
      const candidates = slugCandidates(body.name);
      const existingRows = await prisma.salon.findMany({ where: { slug: { in: candidates } }, select: { slug: true } });
      const takenSet = new Set(existingRows.map((r) => r.slug));
      return ensureUniqueSlug(body.name, (s) => takenSet.has(s));
    })());

    const existingCount = await prisma.salon.count({ where: { ownerId: user.id } });
    // سقف «تعداد سالن هر کاربر» از ماتریس محدودیت‌های پلن خوانده می‌شود (سوپرادمین مستثنا)
    if (user.role !== "ADMIN") await assertLimit({ userId: user.id }, "salons");
    
    // اگر بنری آپلود نشده، از بنر SVG پویا استفاده میکنیم
    const bannerUrl = `/api/salons/${slug}/banner.svg`;
    
    const salon = await prisma.salon.create({
      data: {
        name: body.name,
        slug,
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
        salonType: body.salonType,
        bannerUrl, // بنر پیش‌فرض SVG
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

