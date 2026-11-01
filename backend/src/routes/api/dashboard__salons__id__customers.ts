// CRM مشتریان سالن — هر سالن پروندهٔ مستقل دارد (حتی برای شمارهٔ مشترک)
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  phone: z.string().regex(/^0?9\d{9}$/),
  name: z.string().optional(),
  firstName: z.string().max(80).optional(),
  lastName: z.string().max(80).optional(),
  note: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
});

const patchSchema = z.object({
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
 * مشتریانی که فقط از طریق نوبت شناخته می‌شوند هم به‌صورت خودکار پرونده می‌گیرند تا
 * امکان ثبت یادداشت/عکس برای همهٔ مراجعان وجود داشته باشد.
 */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const url = new URL(_req.url);
    const q = url.searchParams.get("q")?.trim();

    // ساخت پرونده برای شماره‌هایی که فقط در نوبت‌ها وجود دارند
    const [existing, appointmentPhones] = await Promise.all([
      prisma.salonCustomer.findMany({ where: { salonId: id }, select: { phone: true } }),
      prisma.appointment.groupBy({ by: ["customerPhone"], where: { salonId: id } }),
    ]);
    const known = new Set(existing.map((c) => c.phone));
    const missingPhones = appointmentPhones.map((a) => a.customerPhone).filter((p) => p && !known.has(p));
    if (missingPhones.length > 0) {
      const recent = await prisma.appointment.findMany({
        where: { salonId: id, customerPhone: { in: missingPhones } },
        orderBy: { startAt: "desc" },
        select: { customerPhone: true, customerName: true },
      });
      const nameByPhone = new Map<string, string>();
      for (const a of recent) if (!nameByPhone.has(a.customerPhone)) nameByPhone.set(a.customerPhone, a.customerName);
      await prisma.salonCustomer.createMany({
        data: missingPhones.map((phone) => {
          const name = nameByPhone.get(phone) ?? null;
          const { firstName, lastName } = splitName(name);
          return { salonId: id, phone, name, firstName, lastName };
        }),
        skipDuplicates: true,
      });
    }

    const [customers, statusStats, completed] = await Promise.all([
      prisma.salonCustomer.findMany({
        where: q ? { salonId: id, OR: [{ phone: { contains: q } }, { name: { contains: q } }, { firstName: { contains: q } }, { lastName: { contains: q } }] } : { salonId: id },
        include: {
          notes: { orderBy: { createdAt: "desc" }, take: 20 },
          _count: { select: { media: true, notes: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 500,
      }),
      prisma.appointment.groupBy({
        by: ["customerPhone", "status"],
        where: { salonId: id },
        _count: { _all: true },
      }),
      prisma.appointment.findMany({
        where: { salonId: id, status: "COMPLETED" },
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

    return json({ success: true, customers: enriched });
  } catch (err) {
    return apiError(err);
  }
}

/** ویرایش پروندهٔ مشتری/یادداشت */
export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = patchSchema.parse(await req.json());
    const phone = normalizePhone(body.phone);

    const existing = await prisma.salonCustomer.findUnique({ where: { salonId_phone: { salonId: id, phone } } });
    if (!existing) return json({ success: false, error: "customer not found" }, { status: 404 });

    const fullName = body.firstName || body.lastName ? [body.firstName, body.lastName].filter(Boolean).join(" ") : body.name;

    const updated = await prisma.salonCustomer.update({
      where: { id: existing.id },
      data: {
        name: fullName ?? existing.name,
        firstName: body.firstName ?? existing.firstName,
        lastName: body.lastName ?? existing.lastName,
        note: body.note ?? existing.note,
        tags: body.tags ?? existing.tags,
      },
    });

    return json({ success: true, customer: updated });
  } catch (err) {
    return apiError(err);
  }
}

/** اضافه/به‌روزرسانی پروندهٔ مشتری (با یادداشت اختیاری) */
export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = schema.parse(await req.json());
    const phone = normalizePhone(body.phone);
    const fullName = body.firstName || body.lastName ? [body.firstName, body.lastName].filter(Boolean).join(" ") : body.name;

    const existing = await prisma.salonCustomer.findUnique({ where: { salonId_phone: { salonId: id, phone } } });
    // سقف «تعداد مشتری» پلن فقط موقع ساخت پروندهٔ جدید بررسی می‌شود (ویرایش آزاد است)
    if (!existing) await assertLimit({ salonId: id }, "customers");
    if (existing && body.note) {
      await prisma.salonCustomerNote.create({ data: { customerId: existing.id, note: body.note } });
    }

    const customer = existing
      ? await prisma.salonCustomer.update({
          where: { id: existing.id },
          data: {
            name: fullName ?? existing.name,
            firstName: body.firstName ?? existing.firstName,
            lastName: body.lastName ?? existing.lastName,
            tags: body.tags ?? existing.tags,
            note: body.note ?? existing.note,
          },
        })
      : await prisma.salonCustomer.create({
          data: {
            salonId: id,
            phone,
            name: fullName,
            firstName: body.firstName,
            lastName: body.lastName,
            note: body.note,
            tags: body.tags ?? [],
          },
        });

    return json({ success: true, customer }, { status: existing ? 200 : 201 });
  } catch (err) {
    return apiError(err);
  }
}
