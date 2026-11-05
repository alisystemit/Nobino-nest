// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/route.ts — بدون تغییر منطق
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { json, apiError, httpError } from "@/lib/utils";
import { assertLimit, limitSnapshot } from "@/lib/plans/limits";
import { assertDomainFree, assertValidDomain, normalizeDomain } from "@/lib/custom-domain";

/** O6: منطقهٔ زمانی باید IANA معتبر باشد؛ `Intl` با مقدار نامعتبر RangeError می‌دهد */
function assertTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("fa-IR", { timeZone: tz });
  } catch {
    throw httpError("منطقهٔ زمانی انتخابی معتبر نیست (مثال: Asia/Tehran).", 400);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  phone: z.string().min(6).max(20).optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  whatsapp: z.string().max(60).optional().nullable(),
  instagram: z.string().max(80).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
  city: z.string().max(60).optional(),
  address: z.string().max(300).optional(),
  description: z.string().max(1000).optional(),
  mapUrl: z.string().max(300).optional().nullable(),
  baladUrl: z.string().max(300).optional().nullable(),
  neshanUrl: z.string().max(300).optional().nullable(),
  logoUrl: z.string().max(300).optional().nullable(),
  bannerUrl: z.string().max(300).optional().nullable(),
  coverColor: z.string().max(32).optional(),
  timezone: z.string().max(64).optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  customDomain: z.string().max(253).optional().nullable(),
  isActive: z.boolean().optional(),
  minNoticeMinutes: z.number().int().min(0).max(24 * 60).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  cancelDeadlineHours: z.number().int().min(0).max(24 * 30).optional(),
  bufferMinutes: z.number().int().min(0).max(240).optional(),
  // بیعانهٔ نوبت (پیش‌پرداخت رزرو مشتری)
  depositEnabled: z.boolean().optional(),
  depositMode: z.enum(["FIXED", "PERCENT"]).optional(),
  depositValue: z.number().int().min(0).max(100_000_000).optional(),
});

/**
 * O15: «نمایش خود سالن».
 * این مسیر فقط PATCH/DELETE داشت و `GET /api/dashboard/salons/:id` به ۴۰۴
 * `Cannot GET ...` می‌خورد؛ حالا همان سالن را برای صفحهٔ تنظیمات برمی‌گرداند.
 * `domainToken` (چون با آن می‌توان تأیید دامنه را جعل کرد) از پاسخ بیرون می‌ماند.
 */
export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const salon = await prisma.salon.findUnique({
      where: { id },
      omit: { domainToken: true },
      include: { _count: { select: { services: true, staff: true, branches: true, galleryItems: true } } },
    });
    if (!salon) return json({ success: false, error: "سالن یافت نشد" }, { status: 404 });
    const limits = await limitSnapshot(id);
    return json({ success: true, salon, limits });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = patchSchema.parse(await req.json());

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    if (body.timezone !== undefined) assertTimezone(body.timezone);

    const data: Record<string, unknown> = { ...body };
    const rawDomain = body.customDomain === undefined ? undefined : String(body.customDomain ?? "");
    if (rawDomain !== undefined) {
      const nextDomain = normalizeDomain(rawDomain);
      if (nextDomain === normalizeDomain(salon.customDomain ?? "")) {
        // تغییری نکرده: توکن تأیید و وضعیت دامنه نباید دوباره بازنویسی شوند
        delete data.customDomain;
      } else if (nextDomain === "") {
        // پاک کردن دامنه: وضعیت هم باید به حالت اول برگردد
        data.customDomain = null;
        data.domainStatus = "NONE";
        data.domainToken = null;
      } else {
        // O6: دامنهٔ اختصاصی یک امکان پولی است + قالب و یکتایی باید اعتبارسنجی شود
        await assertLimit({ salonId: id }, "customDomain");
        const host = assertValidDomain(nextDomain);
        await assertDomainFree(host, id);
        data.customDomain = host;
        data.domainToken = `nobino-verify-${randomUUID()}`;
        data.domainStatus = "PENDING";
      }
    }

    // بیعانه: در حالت درصدی سقف ۱۰۰ است؛ مقدار بزرگ‌تر معنایی ندارد و رزرو را بی‌بهدولت می‌کند
    if (body.depositValue !== undefined && (body.depositMode ?? salon.depositMode) === "PERCENT" && body.depositValue > 100) {
      return json({ success: false, error: "بیعانه در حالت درصدی نمی‌تواند بیشتر از 100 درصد باشد." }, { status: 400 });
    }

    const updated = await prisma.salon.update({ where: { id }, data });
    return json({ success: true, salon: updated });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);

    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) return json({ success: false, error: "salon not found" }, { status: 404 });

    await prisma.salon.delete({ where: { id } });
    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
