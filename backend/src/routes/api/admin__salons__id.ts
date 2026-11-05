// جزئیات کامل یک سالن برای سوپرادمین (مالک، تماس، شبکه‌های اجتماعی، نقشه، نوبت، درآمد، اشتراک، کارکنان، وضعیت)
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { json, apiError, httpError } from "@/lib/utils";
import { salonPublicUrl } from "@/lib/salon-url";

/** اسلاگ =ساب‌دامین عمومی سالن؛ همان قاعدهٔ برچسب DNS در `lib/salon-url.ts` */
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A23: ویرایش جزئی سالن در پنل ادمین.
 * نسخهٔ قبلی فقط `instagram` را می‌پذیرفت و `salon.update` همان یک ستون را می‌نوشت؛
 * یعنی «ویرایش سالن» برای نام، آدرس، تلفن یا منطقهٔ زمانی بی‌صدا هیچ کاری نمی‌کرد.
 * سازگاری عقب‌رو: `{ instagram }` تنها همچنان معتبر است (پنل فعلی همین را می‌فرستد).
 */
const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: z.string().trim().min(1).max(63),
    phone: z.string().trim().min(6).max(20),
    city: z.string().trim().max(60),
    address: z.string().trim().max(300),
    description: z.string().trim().max(1000),
    timezone: z.string().trim().min(1).max(64),
    instagram: z.string().trim().max(300).nullable(),
    isActive: z.boolean(),
    isApproved: z.boolean(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, {
    message: "حداقل یک فیلد برای ویرایش لازم است",
  });

const FIELD_LABELS: Record<string, string> = {
  name: "نام سالن",
  slug: "آدرس اختصاصی",
  phone: "تلفن",
  city: "شهر",
  address: "آدرس",
  description: "توضیحات",
  timezone: "منطقهٔ زمانی",
  instagram: "اینستاگرام",
  isActive: "فعال بودن",
  isApproved: "تأیید شده",
};

/** منطقهٔ زمانی باید IANA معتبر باشد؛ `Intl` با مقدار نامعتبر RangeError می‌دهد */
function assertTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("fa-IR", { timeZone: tz });
  } catch {
    throw httpError("منطقهٔ زمانی انتخابی معتبر نیست (مثال: Asia/Tehran).", 400);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const before = await prisma.salon.findUnique({ where: { id } });
    if (!before) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const data: Prisma.SalonUpdateInput = {
      ...(body.name != null ? { name: body.name } : {}),
      ...(body.phone != null ? { phone: body.phone } : {}),
      ...(body.city != null ? { city: body.city } : {}),
      ...(body.address != null ? { address: body.address } : {}),
      ...(body.description != null ? { description: body.description } : {}),
      ...(body.instagram !== undefined ? { instagram: body.instagram || null } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.isApproved !== undefined ? { isApproved: body.isApproved } : {}),
      ...(body.timezone != null ? { timezone: body.timezone } : {}),
      ...(body.slug != null ? { slug: body.slug.toLowerCase() } : {}),
    };

    if (body.timezone != null) assertTimezone(body.timezone);

    // اسلاگ: قالب برچسب DNS و یکتا بودن (به‌جز خودِ همین سالن)
    if (body.slug != null) {
      const slug = body.slug.toLowerCase();
      if (!SLUG_RE.test(slug)) {
        throw httpError("آدرس اختصاصی فقط می‌تواند شامل حروف کوچک لاتین، رقم و خط تیره باشد و با حرف یا رقم شروع/تمام شود.", 400);
      }
      if (slug !== before.slug) {
        const taken = await prisma.salon.findFirst({ where: { slug, id: { not: id } }, select: { name: true } });
        if (taken) throw httpError(`آدرس «${slug}» قبلاً توسط سالن «${taken.name}» استفاده شده است.`, 409);
      }
    }

    const salon = await prisma.salon.update({ where: { id }, data });
    await logAudit({
      actorId: user.id,
      actorPhone: user.phone,
      action: "update_salon",
      entityType: "Salon",
      entityId: id,
      before: Object.fromEntries(Object.keys(data).map((k) => [k, (before as unknown as Record<string, unknown>)[k]])),
      after: Object.fromEntries(Object.keys(data).map((k) => [k, (salon as unknown as Record<string, unknown>)[k]])),
    });

    const { domainToken: _omit, ...safe } = salon;
    return json({ success: true, salon: { ...safe, publicUrl: salonPublicUrl(salon) } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const first = err.issues[0];
      const field = String(first?.path?.[0] ?? "");
      const label = FIELD_LABELS[field];
      return json(
        { success: false, error: label ? `مقدار «${label}» معتبر نیست (طول یا نوع ورودی را بررسی کنید).` : "حداقل یک فیلد معتبر برای ویرایش لازم است." },
        { status: 400 }
      );
    }
    return apiError(err);
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await params;

    const salon = await prisma.salon.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, phone: true, name: true, email: true, role: true, createdAt: true } },
        _count: {
          select: {
            appointments: true,
            staff: true,
            services: true,
            branches: true,
            reviews: true,
            orders: true,
            customers: true,
            galleryItems: true,
            invoices: true,
            campaigns: true,
            waitlist: true,
            favorites: true,
            cashEntries: true,
            webhooks: true,
            holidays: true,
            timeBlocks: true,
            voiceCalls: true,
            subscriptions: true,
          },
        },
      },
    });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

    const [
      revenueAgg,
      outstandingAgg,
      subscription,
      recentAppointments,
      statusGroups,
      recentCustomers,
      services,
      staff,
      activeCampaigns,
      latestInvoice,
    ] = await Promise.all([
      prisma.order.aggregate({ where: { salonId: id, status: "PAID" }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { salonId: id, status: "PENDING" }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.subscription.findFirst({
        where: { salonId: id, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        include: { package: { select: { name: true, plan: true, price: true } } },
      }),
      prisma.appointment.findMany({
        where: { salonId: id },
        orderBy: { startAt: "desc" },
        take: 10,
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          startAt: true,
          status: true,
          service: { select: { name: true } },
          employee: { select: { name: true } },
        },
      }),
      prisma.appointment.groupBy({ by: ["status"], where: { salonId: id }, _count: { _all: true } }),
      prisma.salonCustomer.findMany({
        where: { salonId: id },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, name: true, firstName: true, lastName: true, phone: true, visits: true, spend: true, lastVisitAt: true, _count: { select: { notes: true, media: true } } },
      }),
      prisma.service.findMany({ where: { salonId: id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, price: true, durationMin: true, isActive: true } }),
      prisma.staff.findMany({ where: { salonId: id }, select: { id: true, name: true, title: true, isActive: true } }),
      prisma.campaign.findMany({ where: { salonId: id, status: { in: ["SCHEDULED", "SENT"] } }, select: { id: true, name: true, channel: true, status: true } }),
      prisma.invoice.findFirst({ where: { salonId: id }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, amount: true, status: true, createdAt: true } }),
    ]);

    const appointmentsByStatus: Record<string, number> = {};
    for (const g of statusGroups) appointmentsByStatus[g.status] = g._count._all;

    return json({
      success: true,
      salon: {
        ...salon,
        publicUrl: salonPublicUrl(salon),
        paidRevenue: revenueAgg._sum.amount ?? 0,
        outstandingAmount: outstandingAgg._sum.amount ?? 0,
        outstandingCount: outstandingAgg._count._all,
        appointmentsByStatus,
        subscription: subscription
          ? {
              plan: subscription.package.plan,
              name: subscription.package.name,
              price: subscription.package.price,
              endsAt: subscription.endsAt,
              period: subscription.period,
              status: subscription.status,
            }
          : null,
        recentAppointments,
        recentCustomers,
        services,
        staffList: staff,
        activeCampaigns,
        latestInvoice,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
