// API برای لیست مشتریان بدون نیاز به salonId در query params
// اگر salonId وجود نداشت، اولین سالن کاربر رو انتخاب میکنه
import { z } from "zod";
import { requireRole, requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, getPagination } from "@/lib/utils";

const schema = z.object({
  phone: z.string().regex(/^0?9\d{9}$/),
  name: z.string().optional(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  note: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
});

function normalizePhone(phone: string) {
  return phone.startsWith("0") ? phone : `0${phone}`;
}

function splitName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || null };
}

/**
 * CRM: لیست مشتریان سالن با سوابق مراجعه، دفعات بازدید، هزینه‌کرد و یادداشت‌ها.
 * اگر salonId در query params نباشد، اولین سالن کاربر انتخاب می‌شود.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let salonId = url.searchParams.get("salon");
    
    // اگر salonId نیست، اولین سالن کاربر رو انتخاب میکنیم
    if (!salonId) {
      const user = await requireRole(["SALON_OWNER", "ADMIN"]);
      const mySalons = await prisma.salon.findMany({
        where: { ownerId: user.id },
        select: { id: true },
        take: 1,
      });
      if (mySalons.length === 0) {
        return json({ success: false, error: "سالنی یافت نشد" }, { status: 404 });
      }
      salonId = mySalons[0].id;
    }

    await requireSalonManage(salonId);
    
    const q = url.searchParams.get("q")?.trim();

    // ساخت پرونده برای شماره‌هایی که فقط در نوبت‌ها وجود دارند
    const [existing, appointmentPhones] = await Promise.all([
      prisma.salonCustomer.findMany({ where: { salonId }, select: { phone: true } }),
      prisma.appointment.groupBy({ by: ["customerPhone"], where: { salonId } }),
    ]);
    const known = new Set(existing.map((c) => c.phone));
    const missingPhones = appointmentPhones.map((a) => a.customerPhone).filter((p) => p && !known.has(p));
    if (missingPhones.length > 0) {
      const recent = await prisma.appointment.findMany({
        where: { salonId, customerPhone: { in: missingPhones } },
        orderBy: { startAt: "desc" },
        select: { customerPhone: true, customerName: true },
      });
      const nameByPhone = new Map<string, string>();
      for (const a of recent) if (!nameByPhone.has(a.customerPhone)) nameByPhone.set(a.customerPhone, a.customerName);
      await prisma.salonCustomer.createMany({
        data: missingPhones.map((phone) => {
          const name = nameByPhone.get(phone) ?? null;
          const { firstName, lastName } = splitName(name);
          return { salonId, phone, name, firstName, lastName };
        }),
        skipDuplicates: true,
      });
    }

    const customerWhere = q ? { salonId, OR: [{ phone: { contains: q } }, { name: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }] } : { salonId };
    const { page, limit, skip, take } = getPagination(url, 25, 200);

    const [customers, total] = await Promise.all([
      prisma.salonCustomer.findMany({
        where: customerWhere,
        include: {
          notes: { orderBy: { createdAt: "desc" }, take: 20 },
          _count: { select: { media: true, notes: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.salonCustomer.count({ where: customerWhere }),
    ]);

    // آمار فقط برای شماره‌های همین صفحه (سابقهٔ کوئری سنگین روی کل نوبت‌ها حذف شد)
    const pagePhones = Array.from(new Set(customers.map((c) => c.phone)));
    const [statusStats, completed] = await Promise.all([
      prisma.appointment.groupBy({
        by: ["customerPhone", "status"],
        where: { salonId, customerPhone: { in: pagePhones } },
        _count: { _all: true },
      }),
      prisma.appointment.findMany({
        where: { salonId, status: "COMPLETED", customerPhone: { in: pagePhones } },
        select: { customerPhone: true, startAt: true, service: { select: { price: true } } },
      }),
    ]);

    const totals = new Map<string, number>();
    const byStatus = new Map<string, Record<string, number>>();
    const spend = new Map<string, number>();
    const lastVisit = new Map<string, Date>();

    for (const s of statusStats) {
      const map = byStatus.get(s.customerPhone) ?? {};
      map[s.status] = s._count._all;
      byStatus.set(s.customerPhone, map);
      totals.set(s.customerPhone, (totals.get(s.customerPhone) ?? 0) + s._count._all);
    }

    for (const a of completed) {
      spend.set(a.customerPhone, (spend.get(a.customerPhone) ?? 0) + (a.service?.price ?? 0));
      const latest = lastVisit.get(a.customerPhone);
      if (!latest || a.startAt > latest) lastVisit.set(a.customerPhone, a.startAt);
    }

    const enriched = customers.map((c) => {
      const stats = byStatus.get(c.phone) ?? {};
      const visits = totals.get(c.phone) ?? c.visits;
      const spendValue = spend.get(c.phone) ?? 0;
      const fallbackName = splitName(c.name);
      return {
        ...c,
        firstName: c.firstName ?? fallbackName.firstName,
        lastName: c.lastName ?? fallbackName.lastName,
        visits,
        completed: stats.COMPLETED ?? 0,
        cancelled: stats.CANCELLED ?? 0,
        noShow: stats.NO_SHOW ?? 0,
        spend: spendValue,
        lastVisit: lastVisit.get(c.phone)?.toISOString() ?? c.lastVisitAt?.toISOString() ?? null,
        mediaCount: c._count.media,
        notesCount: c._count.notes,
      };
    });

    return json({ success: true, customers: enriched, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}
