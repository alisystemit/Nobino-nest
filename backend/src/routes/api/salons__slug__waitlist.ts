// خودکار: پورت‌شده از src/app/api/salons/[slug]/waitlist/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";

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
    const entries = await prisma.waitlistEntry.findMany({ where: { salonId: salon.id }, orderBy: { createdAt: "desc" } });
    return json({ success: true, entries });
  } catch (err) {
    return apiError(err);
  }
}
