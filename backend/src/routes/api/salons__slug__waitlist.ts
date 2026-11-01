// خودکار: پورت‌شده از src/app/api/salons/[slug]/waitlist/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { json, apiError, getPagination } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

const createSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().regex(/^0?9\d{9}$/),
  serviceId: z.string().optional(),
  employeeId: z.string().optional(),
  note: z.string().optional(),
});

/** ثبت مشتری در لیست انتظار (عمومی) */
export async function POST(req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const salon = await prisma.salon.findUnique({ where: { slug } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const body = createSchema.parse(await req.json());
    const phone = body.customerPhone.startsWith("0") ? body.customerPhone : `0${body.customerPhone}`;

    const entry = await prisma.waitlistEntry.create({
      data: { salonId: salon.id, employeeId: body.employeeId, serviceId: body.serviceId, customerName: body.customerName, customerPhone: phone, note: body.note },
    });

    return json({ success: true, entry }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

export async function GET(_req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  try {
    const user = await requireRole(["SALON_OWNER", "ADMIN"]);
    const { slug } = await params;
    const salon = await prisma.salon.findUnique({ where: { slug } });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
      return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
    }
    const { page, limit, skip, take } = getPagination(_req.url, 25, 200);
    const where: Prisma.WaitlistEntryWhereInput = { salonId: salon.id };
    const url = new URL(_req.url);
    const status = url.searchParams.get("status")?.trim();
    if (status) where.status = status as never;
    const [entries, total] = await Promise.all([
      prisma.waitlistEntry.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      prisma.waitlistEntry.count({ where }),
    ]);
    return json({ success: true, entries, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}
