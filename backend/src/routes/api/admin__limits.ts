// خودکار: پورت‌شده از src/app/api/admin/limits/route.ts — بدون تغییر منطق
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { getLimitsMatrix, savePlanLimits } from "@/lib/plans/limits-admin";
import { limitCatalogIssues } from "@/lib/plans/limits";
import { json, apiError } from "@/lib/utils";

/**
 * ماتریس محدودیت پلن‌ها (فقط سوپرادمین).
 *
 * GET  → کاتالوگ محدودیت‌ها + پیش‌فرض و مقدار دست‌ی هر پلن
 * PATCH → ذخیرهٔ خانه‌های انتخابی؛ `value: null` یعنی بازگشت به پیش‌فرض پلن
 */

const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        plan: z.string().min(2).max(20),
        key: z.string().min(1).max(40),
        value: z.union([z.string().max(20), z.number().min(0).max(1_000_000), z.boolean(), z.null()]),
      })
    )
    .min(1)
    .max(200),
});

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const matrix = await getLimitsMatrix();
    return json({ success: true, ...matrix, issues: limitCatalogIssues() });
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = updateSchema.parse(await req.json());
    const result = await savePlanLimits(body.updates, { id: user.id, phone: user.phone });
    return json({ success: true, saved: result.saved, matrix: result.matrix });
  } catch (err) {
    return apiError(err);
  }
}
