// سازندهٔ مسیر: پیش‌نمایش مخاطب کمپین (بدون ساخت کمپین و بدون ارسال پیامک)
import { z } from "zod";
import { requireSalonManage } from "@/lib/auth/guards";
import { checkLimit, PLAN_LABELS } from "@/lib/plans/limits";
import { resolveCampaignAudience } from "@/lib/marketing/segments";
import { SEGMENT_KEYS } from "@/lib/marketing/segments-core";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  segment: z.enum(SEGMENT_KEYS).default("ALL"),
  filters: z.unknown().optional(),
});

/** «چند نفر مخاطب این بخش‌بندی‌اند؟» — همان منطقی که `/campaigns/:id/run` اجرا می‌کند */
export async function POST(req: Request, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSalonManage(id);
    const body = schema.parse(await req.json());

    const [audience, smsCap] = await Promise.all([
      resolveCampaignAudience(id, body.segment, body.filters),
      checkLimit({ salonId: id }, "smsPerMonth"),
    ]);

    const remaining = typeof smsCap.limit === "number" ? Math.max(0, smsCap.limit - smsCap.used) : audience.recipients.length;
    return json({
      success: true,
      matched: audience.total,
      sendable: audience.recipients.length,
      /** حداکثر پیامکی که همین حالا سهمیهٔ ماهانه اجازه می‌دهد */
      willSend: Math.min(audience.recipients.length, remaining),
      invalid: audience.invalid,
      truncated: audience.truncated,
      sample: audience.sample,
      quota: { planLabel: PLAN_LABELS[smsCap.plan], used: smsCap.used, limit: smsCap.limit, label: smsCap.def.label },
    });
  } catch (err) {
    return apiError(err);
  }
}
