// خودکار: پورت‌شده از src/app/api/admin/charts/route.ts
// سطل‌بندی ماه در دیتابیس و به وقت تهران انجام می‌شود (یافتهٔ A19 + O8):
// نسخهٔ قبلی چهار `findMany` بی‌سقف می‌زد و در RAM جمع می‌زد، ضمناً ماه را با
// `toISOString()` (یعنی UTC) برچسب می‌زد؛ برای کسب‌وکار ایرانی یعنی نیمی از
// رویدادهای اولِ ماه در ماه اشتباه می‌نشینند.


import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { localMidnightUTC, localParts } from "@/lib/timezone";
import { json, apiError } from "@/lib/utils";

const TZ = "Asia/Tehran";

/** کلید ماه‌های تهران (`YYYY-MM`) برای `count` ماه اخیر، از قدیمی به جدید */
function recentMonthKeys(count = 12): string[] {
  const { dayISO } = localParts(new Date(), TZ);
  const parts = dayISO.split("-");
  let year = Number(parts[0]);
  let month = Number(parts[1]);
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.unshift(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return keys;
}

/** نگاشت ردیف‌های `{ m, … }` به آرایه‌ای هم‌تراز با `months` (ماه‌های بی‌داده صفر) */
function series(rows: Array<Record<string, unknown>>, months: string[], pick: (row: Record<string, unknown>) => number): number[] {
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const key = String(r["m"] ?? "");
    byMonth.set(key, (byMonth.get(key) ?? 0) + pick(r));
  }
  return months.map((m) => byMonth.get(m) ?? 0);
}

/** داده نمودارهای سوپرادمین: درآمد ماهانه، رشد کاربران، نوبت‌ها، ریزش */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);

    const months = recentMonthKeys(12);
    // از = نیم‌شب اولِ نخستین ماه displayed به وقت تهران
    const from = localMidnightUTC(`${months[0]}-01`, TZ);

    const [revenueRows, userRows, apptRows, churnRows] = await Promise.all([
      prisma.$queryRaw<Array<{ m: string; total: bigint }>>`
        SELECT to_char("createdAt" AT TIME ZONE 'Asia/Tehran', 'YYYY-MM') AS m,
               COALESCE(SUM("amount"), 0)::bigint AS total
        FROM "Order"
        WHERE "status" = 'PAID' AND "createdAt" >= ${from}
        GROUP BY 1`,
      prisma.$queryRaw<Array<{ m: string; total: bigint }>>`
        SELECT to_char("createdAt" AT TIME ZONE 'Asia/Tehran', 'YYYY-MM') AS m,
               COUNT(*)::bigint AS total
        FROM "User"
        WHERE "createdAt" >= ${from}
        GROUP BY 1`,
      prisma.$queryRaw<Array<{ m: string; total: bigint; cancelled: bigint }>>`
        SELECT to_char("createdAt" AT TIME ZONE 'Asia/Tehran', 'YYYY-MM') AS m,
               COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE "status" IN ('CANCELLED', 'NO_SHOW'))::bigint AS cancelled
        FROM "Appointment"
        WHERE "createdAt" >= ${from}
        GROUP BY 1`,
      prisma.$queryRaw<Array<{ m: string; total: bigint }>>`
        SELECT to_char("createdAt" AT TIME ZONE 'Asia/Tehran', 'YYYY-MM') AS m,
               COUNT(*)::bigint AS total
        FROM "Subscription"
        WHERE "createdAt" >= ${from} AND "status" IN ('CANCELLED', 'EXPIRED')
        GROUP BY 1`,
    ]);

    const amountOf = (r: Record<string, unknown>) => Number(r["total"] ?? 0);
    const cancelledOf = (r: Record<string, unknown>) => Number(r["cancelled"] ?? 0);

    // برچسب ماه‌ها به فارسی (مثلاً «آبان ۱۴۰۵») — از کلیدِ ماه تا ساعت ۱۲ ظهر تا
    // جابه‌جایی منطقهٔ زمانی برچسب را عوض نکند
    const monthLabels = months.map((m) =>
      new Intl.DateTimeFormat("fa-IR", { month: "long", year: "numeric", timeZone: TZ }).format(new Date(`${m}-01T12:00:00Z`))
    );

    return json({
      success: true,
      timezone: TZ,
      months: monthLabels,
      revenue: series(revenueRows, months, amountOf),
      userGrowth: series(userRows, months, amountOf),
      appointments: series(apptRows, months, amountOf),
      cancelled: series(apptRows, months, cancelledOf),
      churn: series(churnRows, months, amountOf),
    });
  } catch (err) {
    return apiError(err);
  }
}
