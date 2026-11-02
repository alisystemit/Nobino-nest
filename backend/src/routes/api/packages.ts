// خودکار: پورت‌شده از src/app/api/packages/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { json, getPagination } from "@/lib/utils";
import { normalizePlan, getPlanLimitsForPlan } from "@/lib/plans/limits";
import { resolveFeatures } from "@/lib/plans/modules";

/**
 * پکیج‌های فعال برای صفحهٔ فروش.
 * ماژول‌ها از کاتالوگ واقعی سامانه resolve می‌شوند؛ یعنی برچسب سقف‌ها
 * (کارمند/شعبه) از تنظیمات زندهٔ پلن خوانده می‌شود، نه متن ثابت.
 */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  const { page, limit, skip, take } = getPagination(_req.url, 6, 50);

  const where = { isActive: true };
  const [packages, total] = await Promise.all([
    prisma.package.findMany({
      where,
      orderBy: [{ price: "asc" }, { id: "asc" }],
      skip,
      take,
    }),
    prisma.package.count({ where }),
  ]);

  const plans = [...new Set(packages.map((p) => normalizePlan(p.plan)))];
  const limitsByPlan = Object.fromEntries(
    await Promise.all(plans.map(async (plan) => [plan, await getPlanLimitsForPlan(plan)] as const))
  );

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return json({
    success: true,
    packages: packages.map((p) => {
      const plan = normalizePlan(p.plan);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        plan,
        price: p.price,
        yearlyPrice: p.yearlyPrice,
        durationDays: p.durationDays,
        features: resolveFeatures(p.features, limitsByPlan[plan]),
      };
    }),
    total,
    page,
    limit,
    totalPages,
  });
}
