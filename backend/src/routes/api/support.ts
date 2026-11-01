// خودکار: پورت‌شده از src/app/api/support/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { json, apiError, getPagination } from "@/lib/utils";

const createSchema = z.object({
  subject: z.string().trim().min(3, "موضوع باید حداقل ۳ حرف باشد").max(120),
  category: z.enum(["GENERAL", "BOOKING", "PAYMENT", "TECHNICAL", "COMPLAINT"]).default("GENERAL"),
  message: z.string().trim().min(10, "توضیحات باید حداقل ۱۰ حرف باشد").max(2000),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
});

/** ثبت درخواست پشتیبانی توسط کاربر جاری */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = createSchema.parse(await req.json());

    // محدودیت ضد اسپم: حداکثر ۱۰ درخواست در ۲۴ ساعت
    const recent = await prisma.supportTicket.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
    });
    if (recent >= 10) {
      return json(
        { success: false, error: "تعداد درخواست‌های شما در ۲۴ ساعت گذشته بیش از حد مجاز است." },
        { status: 429 }
      );
    }

    const isSyntheticPhone = user.phone.startsWith("email:");
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: user.id,
        name: user.name ?? "مشتری",
        phone: isSyntheticPhone ? "" : user.phone,
        email: user.email,
        subject: body.subject,
        category: body.category,
        message: body.message,
        priority: body.priority,
      },
    });

    return json({ success: true, ticket }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}

/** فهرست درخواست‌های پشتیبانی کاربر جاری */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const { page, limit, skip, take } = getPagination(_req.url, 20, 100);
    const where = { userId: user.id };
    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      prisma.supportTicket.count({ where }),
    ]);
    return json({ success: true, tickets, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}

