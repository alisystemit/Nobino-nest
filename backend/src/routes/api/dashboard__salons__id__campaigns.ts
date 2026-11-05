// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/campaigns/route.ts — بدون تغییر منطق
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit, checkLimit, PLAN_LABELS } from "@/lib/plans/limits";
import { isEmptyFilters, parseFilters, segmentSummary, SEGMENT_KEYS } from "@/lib/marketing/segments-core";
import { json, apiError, getPagination } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1),
  channel: z.enum(["SMS", "EMAIL"]).default("SMS"),
  segment: z.enum(SEGMENT_KEYS).default("ALL"),
  filters: z.unknown().optional(),
  message: z.string().min(1).max(1000),
  scheduledAt: z.string().datetime().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const { page, limit, skip, take } = getPagination(_req.url, 25, 200);
    const where = { salonId: id };
    const [rows, total, smsCap, campaignCap] = await Promise.all([
      prisma.campaign.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      prisma.campaign.count({ where }),
      checkLimit({ salonId: id }, "smsPerMonth"),
      checkLimit({ salonId: id }, "campaigns"),
    ]);
    const campaigns = rows.map((c) => ({ ...c, segmentSummary: segmentSummary(c.segment, parseFilters(c.filters)) }));
    // «مصرف این ماه» باید از خود سرور بیاید (شمارش پیامک، نه تعداد کمپین‌های همین صفحه)
    return json({
      success: true,
      campaigns,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      usage: {
        planLabel: PLAN_LABELS[smsCap.plan],
        sms: { used: smsCap.used, limit: smsCap.limit, label: smsCap.def.label },
        campaigns: { used: campaignCap.used, limit: campaignCap.limit, label: campaignCap.def.label },
      },
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = schema.parse(await req.json());
    await assertLimit({ salonId: id }, "campaigns");
    const filters = parseFilters(body.filters);
    const campaign = await prisma.campaign.create({
      data: {
        salonId: id,
        name: body.name,
        channel: body.channel,
        segment: body.segment,
        // ردیف خالیِ معیارها `null` می‌ماند تا کمپین‌های قدیمی و جدید یکی به نظر برسند
        filters: isEmptyFilters(filters) ? Prisma.DbNull : filters,
        message: body.message,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: body.scheduledAt ? "SCHEDULED" : "DRAFT",
      },
    });
    return json({ success: true, campaign }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}