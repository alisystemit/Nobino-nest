// خودکار: پورت‌شده از src/app/api/payments/create/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { createPaymentForOrder } from "@/lib/payments/engine";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  packageId: z.string(),
  salonId: z.string().optional(),
  gateway: z.string().optional(),
  discountCode: z.string().optional(),
  period: z.enum(["MONTHLY", "YEARLY"]).default("MONTHLY"),
  autoRenew: z.boolean().default(false),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = schema.parse(await req.json());

    const pkg = await prisma.package.findUnique({ where: { id: body.packageId } });
    if (!pkg || !pkg.isActive) return json({ success: false, error: "پکیج یافت نشد" }, { status: 404 });

    // اعتبارسنجی مالکیت سالن: کاربر فقط می‌تواند برای سالن خودش اشتراک بخرد
    let salonId = body.salonId;
    if (salonId) {
      const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { ownerId: true } });
      if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
      if (user.role !== "ADMIN" && salon.ownerId !== user.id) {
        return json({ success: false, error: "دسترسی غیرمجاز" }, { status: 403 });
      }
    } else if (user.role !== "ADMIN") {
      const owned = await prisma.salon.findFirst({
        where: { ownerId: user.id },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (owned) salonId = owned.id;
    }

    // قیمت بر اساس دوره: سالانه = price*10 (یا yearlyPrice اگر تنظیم شده باشد)
    const unitPrice = body.period === "YEARLY" ? (pkg.yearlyPrice ?? pkg.price * 10) : pkg.price;

    let amount = unitPrice;
    let originalAmount = unitPrice;
    let discountId: string | undefined;

    // اعمال کد تخفیف
    if (body.discountCode) {
      const discount = await prisma.discount.findUnique({ where: { code: body.discountCode.trim().toUpperCase() } });
      if (!discount || !discount.isActive) {
        return json({ success: false, error: "کد تخفیف نامعتبر است" }, { status: 400 });
      }
      if (discount.expiresAt && discount.expiresAt < new Date()) {
        return json({ success: false, error: "کد تخفیف منقضی شده است" }, { status: 400 });
      }
      if (discount.maxUses > 0 && discount.usedCount >= discount.maxUses) {
        return json({ success: false, error: "کد تخفیف استفاده شده است" }, { status: 400 });
      }
      const discountAmount = Math.round((unitPrice * discount.percent) / 100);
      amount = Math.max(0, unitPrice - discountAmount);
      discountId = discount.id;
      // مبلغ پیش از تخفیف هم باید دورهٔ انتخاب‌شده را رعایت کند (نه فقط قیمت ماهانه)
      originalAmount = unitPrice;
      // شمارندهٔ استفاده فقط در callback موفق و داخل همان تراکنش افزایش می‌یابد
      // (lib/payments/engine.ts) — اینجا عملاً چیزی نوشته نمی‌شود تا پرداخت
      // ناموفق سهمیهٔ کد را نسوزاند.
    }

    const order = await prisma.order.create({
      data: {
        userId: user.id,
        salonId,
        packageId: pkg.id,
        discountId,
        amount,
        originalAmount,
        period: body.period,
        autoRenew: body.autoRenew,
        status: "PENDING",
      },
    });

    const { payment, gateway } = await createPaymentForOrder({ orderId: order.id, gateway: body.gateway });

    return json(
      {
        success: true,
        orderId: order.id,
        paymentId: payment.id,
        gateway,
        redirectUrl: payment.redirectUrl,
        amount,
        originalAmount,
        discountApplied: discountId ? true : false,
      },
      { status: 201 }
    );
  } catch (err) {
    return apiError(err);
  }
}

