// خودکار: پورت‌شده از src/app/api/dashboard/salons/[id]/campaigns/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { assertLimit } from "@/lib/plans/limits";
import { json, apiError, getPagination } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(1),
  channel: z.enum(["SMS", "EMAIL"]).default("SMS"),
  segment: z.enum(["ALL", "RETURNING"]).default("ALL"),
  message: z.string().min(1).max(1000),
  scheduledAt: z.string().datetime().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const { page, limit, skip, take } = getPagination(_req.url, 25, 200);
    const where = { salonId: id };
    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take }),
      prisma.campaign.count({ where }),
    ]);
    return json({ success: true, campaigns, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
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
    const campaign = await prisma.campaign.create({
      data: {
        salonId: id,
        name: body.name,
        channel: body.channel,
        segment: body.segment,
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