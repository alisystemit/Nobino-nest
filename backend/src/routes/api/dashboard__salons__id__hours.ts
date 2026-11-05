// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/hours/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/** ساعت واقعی ۲۴ ساعته («۲۵:۰۰» یا «۹:۰» نباید رد شوند و بعد در محاسبهٔ پنجره منفجر شوند) */
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "قالب ساعت باید HH:MM باشد");

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const daySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: timeSchema,
    closeTime: timeSchema,
    isClosed: z.boolean().default(false),
  })
  // O5: بازهٔ معکوس («۲۰:۰۰ → ۰۸:۰۰») تقویم را قفل/باز می‌کرد؛ محاسبهٔ اسلات close>open را فرض می‌کند
  .refine((d) => d.isClosed || toMinutes(d.closeTime) > toMinutes(d.openTime), {
    message: "ساعت بسته‌شدن باید بعد از ساعت باز شدن باشد (روز تعطیل را با «تعطیل» علامت بزنید).",
  });

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const hours = await prisma.openingHour.findMany({ where: { salonId: id }, orderBy: { dayOfWeek: "asc" } });
    return json({ success: true, hours });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    const body = z.object({ days: z.array(daySchema).max(7) }).parse(await req.json());

    // O5: نسخهٔ قبلی از snapshot «existing» استفاده می‌کرد؛ اگر یک روز دو بار در body
    // می‌آمد، دومی دوباره create می‌شد و روی یکتای (salonId, dayOfWeek) خطای ۵۰۰ می‌داد.
    // اینجا برای هر روز فقط یک upsert داریم و همه در یک تراکنش اجرا می‌شوند.
    const byDay = new Map<number, z.infer<typeof daySchema>>();
    for (const d of body.days) byDay.set(d.dayOfWeek, d);

    await prisma.$transaction(async (tx) => {
      for (const d of byDay.values()) {
        await tx.openingHour.upsert({
          where: { salonId_dayOfWeek: { salonId: id, dayOfWeek: d.dayOfWeek } },
          update: { openTime: d.openTime, closeTime: d.closeTime, isClosed: d.isClosed },
          create: { salonId: id, dayOfWeek: d.dayOfWeek, openTime: d.openTime, closeTime: d.closeTime, isClosed: d.isClosed },
        });
      }
    });

    const hours = await prisma.openingHour.findMany({ where: { salonId: id }, orderBy: { dayOfWeek: "asc" } });
    return json({ success: true, hours });
  } catch (err) {
    return apiError(err);
  }
}
