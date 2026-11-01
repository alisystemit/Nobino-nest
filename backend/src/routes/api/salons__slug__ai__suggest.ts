// خودکار: پورت‌شده از src/app/api/salons/[slug]/ai/suggest/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { suggestAlternatives } from "@/lib/ai/suggest";
import { json } from "@/lib/utils";

const schema = z.object({
  serviceId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.string().optional(),
});

/** پیشنهاد زمان‌های جایگزین وقتی بازه انتخابی پر است */
export async function POST(req: Request, { params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = schema.parse(await req.json());

  const salon = await prisma.salon.findUnique({ where: { slug } });
  if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });

  const result = await suggestAlternatives({ salonId: salon.id, serviceId: body.serviceId, employeeId: body.employeeId, dayISO: body.date });
  return json({ success: true, ...result });
}
