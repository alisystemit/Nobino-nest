import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { localMidnightUTC, localParts } from "@/lib/timezone";
import { BOOL_DEFS, COUNT_DEFS, LIMIT_DEFS, formatLimit, limitSettingKey, type LimitDef } from "./limit-defs";
import {
  PLAN_DEFAULTS,
  PLAN_LABELS,
  bestPlan,
  normalizePlan,
  type NumericLimitKey,
  type PlanLimits,
  type PlanName,
} from "./limits-data";

/**
 * محدودیت پلن‌های اشتراک (SaaS).
 *
 * کاتالوگ سقف‌ها در `plans/limit-defs.ts` و مقادیر پیش‌فرض در `plans/limits-data.ts`
 * هستند (هر دو خالص و بدون دیتابیس). این فایل فقط «خواندن مقدار از دیتابیس» و
 * «اندازه‌گیری مصرف» را انجام می‌دهد.
 *
 * برای افزودن یک محدودیت جدید:
 * ۱) یک سطر به `LIMIT_DEFS` ۲) یک مقدار به `PLAN_DEFAULTS` هر پلن
 * ۳) یک فراخوانی `assertLimit` در مسیر ساخت آن منبع.
 *
 * اولویت تعیین هر محدودیت:
 * ۱) تنظیم اختصاصی همان پلن: `plan.limit.<PLAN>.<key>`
 * ۲) تنظیم عمومی (سازگاری با نسخه‌های قبلی): `plan.limit.<key>`
 * ۳) مقدار پیش‌فرض پلن
 */
export * from "./limits-data";

async function readOverride(plan: PlanName, key: keyof PlanLimits): Promise<string | undefined> {
  const scoped = await getSetting(limitSettingKey(plan, key));
  if (scoped != null && scoped !== "") return scoped;
  return getSetting(`plan.limit.${key}`);
}

/** محدودیت‌های یک پلن (با اعمال تنظیمات دست‌ی سوپرادمین) */
export async function getPlanLimitsForPlan(plan: PlanName): Promise<PlanLimits> {
  const out = { ...PLAN_DEFAULTS[plan] };
  const bag = out as unknown as Record<string, number | boolean>;
  await Promise.all(
    LIMIT_DEFS.map(async (def) => {
      const raw = await readOverride(plan, def.key);
      if (raw == null || raw === "") return;
      if (def.kind === "count") {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0) bag[def.key as string] = Math.floor(parsed);
      } else if (raw === "true") bag[def.key as string] = true;
      else if (raw === "false") bag[def.key as string] = false;
    })
  );
  return out;
}

/** محدودیت‌های پلن جاری یک سالن (بدون salonId یعنی پلن رایگان) */
export async function getPlanLimits(salonId?: string): Promise<PlanLimits> {
  let plan: PlanName = "FREE";
  if (salonId) {
    const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { plan: true } });
    plan = normalizePlan(salon?.plan);
  }
  return getPlanLimitsForPlan(plan);
}

/** پلن جاری یک سالن (برای نمایش در پنل و صفحه پکیج‌ها) */
export async function getSalonPlan(salonId: string) {
  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: {
      plan: true,
      ownerId: true,
      subscriptions: {
        where: { status: "ACTIVE", endsAt: { gt: new Date() } },
        orderBy: { endsAt: "desc" },
        take: 1,
        select: { endsAt: true, autoRenew: true, package: { select: { id: true, name: true } } },
      },
    },
  });
  const plan = normalizePlan(salon?.plan);
  return {
    plan,
    label: PLAN_LABELS[plan],
    limits: await getPlanLimits(salonId),
    usage: await salonUsage(salonId),
    subscription: salon?.subscriptions[0] ?? null,
  };
}

/** ابتدای ماه جاری به وقت تهران (برای سقف‌های ماهانه مثل پیامک و کمپین) */
export function monthStart(now = new Date(), timeZone = "Asia/Tehran"): Date {
  const { dayISO } = localParts(now, timeZone);
  return localMidnightUTC(`${dayISO.slice(0, 7)}-01`, timeZone);
}

/** مصرف فعلی یک سالن برای همهٔ سقف‌های شمارشی سطح سالن */
export async function salonUsage(
  salonId: string,
  now = new Date()
): Promise<Partial<Record<NumericLimitKey, number>>> {
  const from = monthStart(now);
  const [staff, branches, services, galleryItems, customers, campaigns, webhooks, sms] = await Promise.all([
    prisma.staff.count({ where: { salonId, isActive: true } }),
    prisma.branch.count({ where: { salonId, isActive: true } }),
    prisma.service.count({ where: { salonId, isActive: true } }),
    prisma.galleryItem.count({ where: { salonId } }),
    prisma.salonCustomer.count({ where: { salonId } }),
    prisma.campaign.count({ where: { salonId, createdAt: { gte: from } } }),
    prisma.webhookConfig.count({ where: { salonId, isActive: true } }),
    prisma.notification.count({
      where: { salonId, channel: "SMS", createdAt: { gte: from }, status: { in: ["PENDING", "SENT"] } },
    }),
  ]);
  return { staff, branches, services, galleryItems, customers, campaigns, webhooks, smsPerMonth: sms };
}

/** تعداد سالن‌های یک کاربر (مصرف سقف سطح مالک) */
export async function ownerSalonCount(userId: string): Promise<number> {
  return prisma.salon.count({ where: { ownerId: userId } });
}

/**
 * بررسی یک سقف. `subject` می‌تواند سالن یا کاربر باشد؛ سقف‌های سطح مالک
 * (مثل تعداد سالن) از `userId` و بقیه از `salonId` خوانده می‌شوند.
 */
export type LimitCheck = {
  allowed: boolean;
  def: LimitDef;
  plan: PlanName;
  limit: number | boolean;
  used: number;
  /** پیام فارسی آماده برای نمایش به کاربر (وقتی allowed=false است) */
  message: string;
};

export async function checkLimit(
  subject: { salonId?: string; userId?: string },
  key: keyof PlanLimits
): Promise<LimitCheck> {
  const def = LIMIT_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`محدودیت ناشناخته: ${String(key)}`);

  let plan: PlanName = "FREE";
  let used = 0;

  if (def.scope === "owner") {
    let userId = subject.userId;
    if (!userId && subject.salonId) {
      const salon = await prisma.salon.findUnique({ where: { id: subject.salonId }, select: { ownerId: true } });
      userId = salon?.ownerId ?? undefined;
    }
    if (userId) {
      const salons = await prisma.salon.findMany({ where: { ownerId: userId }, select: { plan: true } });
      plan = bestPlan(salons.map((s) => s.plan));
      used = salons.length;
    }
  } else if (subject.salonId) {
    const salon = await prisma.salon.findUnique({ where: { id: subject.salonId }, select: { plan: true } });
    plan = normalizePlan(salon?.plan);
    // فقط برای سقف‌های شمارشی لازم است مصرف اندازه گرفته شود (یک کوئری سنگین)
    if (def.kind === "count") {
      const usage = await salonUsage(subject.salonId);
      used = (usage as Record<string, number | undefined>)[key as string] ?? 0;
    }
  }

  const limits = await getPlanLimitsForPlan(plan);
  const limit = limits[key];
  const allowed = typeof limit === "boolean" ? limit : used < limit;

  const message = allowed
    ? ""
    : def.kind === "bool"
      ? `«${def.label}» در پلن ${PLAN_LABELS[plan]} فعال نیست. برای ارتقای پلن به بخش اشتراک‌ها مراجعه کنید.`
      : `به سقف «${def.label}» پلن ${PLAN_LABELS[plan]} رسیدید (${formatLimit(def, limit as number)}). با ارتقای پلن می‌توانید ادامه دهید.`;

  return { allowed, def, plan, limit, used, message };
}

/** خطای کنترلی؛ `apiError` مقدار `status` را به کد HTTP تبدیل می‌کند */
export class LimitExceededError extends Error {
  status = 402;
  constructor(message: string) {
    super(message);
    this.name = "LimitExceededError";
  }
}

/** مثل checkLimit ولی در صورت رد شدن، خطای ۴۰۲ با پیام فارسی پرتاب می‌کند */
export async function assertLimit(subject: { salonId?: string; userId?: string }, key: keyof PlanLimits) {
  const check = await checkLimit(subject, key);
  if (!check.allowed) throw new LimitExceededError(check.message);
  return check;
}

/**
 * سازگار با نسخه‌های قبلی: فقط «آیا مجاز است» را برمی‌گرداند.
 * برای پیام دقیق‌تر از `checkLimit`/`assertLimit` استفاده کنید.
 */
export async function withinLimit(salonId: string, key: keyof PlanLimits): Promise<boolean> {
  const check = await checkLimit({ salonId }, key);
  return check.allowed;
}

/** وضعیت همهٔ سقف‌های یک سالن، برای کارت «مصرف پلن» در داشبورد */
export async function limitSnapshot(salonId: string) {
  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    select: { plan: true, ownerId: true },
  });
  const plan = normalizePlan(salon?.plan);
  const limits = await getPlanLimitsForPlan(plan);
  const usage = await salonUsage(salonId);
  const ownerUsed = salon ? await ownerSalonCount(salon.ownerId) : 0;

  return {
    plan,
    planLabel: PLAN_LABELS[plan],
    counts: COUNT_DEFS.map((def) => ({
      key: def.key as string,
      label: def.label,
      unit: def.unit,
      icon: def.icon,
      hint: def.hint,
      monthly: Boolean(def.monthly),
      scope: def.scope,
      limit: limits[def.key] as number,
      used: def.scope === "owner" ? ownerUsed : ((usage as Record<string, number | undefined>)[def.key as string] ?? 0),
    })),
    bools: BOOL_DEFS.map((def) => ({
      key: def.key as string,
      label: def.label,
      icon: def.icon,
      hint: def.hint,
      on: limits[def.key] as boolean,
    })),
  };
}

/** کلید تنظیمات یک محدودیت (برای نوشتن از پنل سوپرادمین) */
export { limitSettingKey };
