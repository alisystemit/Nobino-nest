/**
 * منطق تجاری پکیج‌ها (SaaS) — ساخت/ویرایش/حذف و خواندن فهرست ادمین.
 *
 * چرا این‌جا و نه داخل Route Handler؟ طبق قواعد پروژه، همهٔ منطق تجاری در `src/lib`
 * است تا هم قابل تست باشد و هم یک‌رفتار در همهٔ ورودی‌ها.
 *
 * نکتهٔ مهم دربارهٔ حذف: `Subscription.packageId` و `Order.packageId` رابطهٔ اجباری
 * و بدون cascade هستند؛ حذف پکیجی که اشتراک یا سفارش دارد کل تاریخچهٔ مالی را
 * می‌شکند. پس در آن حالت پکیج فقط **غیرفعال** می‌شود و حذف قطعی تنها با `force`
 * و فقط وقتی مجاز است که هیچ سفارش پرداخت‌شده‌ای به آن وصل نباشد.
 */
import { prisma } from "@/lib/prisma";
import { asNumber } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { getPlanLimitsForPlan, normalizePlan, PLAN_ORDER } from "@/lib/plans/limits";
import { resolveFeatures, type StoredFeature } from "@/lib/plans/modules";

/** خطای کنترلی؛ `apiError` مقدار `status` را به کد HTTP تبدیل می‌کند */
export class PackageConflictError extends Error {
  status = 409;
}

/** خطای اعتبارسنجی ورودی پکیج → 400 فارسی */
export class PackageValidationError extends Error {
  status = 400;
}

/** سالانه حداکثر ۱۳ برابر ماهانه (۱۲ قسط + یک ماه تلورانس) */
const MAX_YEARLY_MULTIPLIER = 13;

/**
 * پلن باید دقیقاً یکی از پلن‌های شناخته‌شده باشد.
 *
 * چرا لازم است: `normalizePlan()` هر رشتهٔ ناشناخته‌ای را **بی‌صدا** «FREE» می‌کند،
 * پس پکیج پولی با سطح دسترسی رایگان ساخته می‌شد و سقف‌های FREE روی مشتری فعال
 * می‌گشت (یافتهٔ A21).
 */
export function assertKnownPlan(value: string) {
  const raw = String(value ?? "").trim();
  if (!(PLAN_ORDER as readonly string[]).includes(raw.toUpperCase())) {
    throw new PackageValidationError(
      `پلن «${raw || "(خالی)"}» در فهرست پلن‌ها نیست (مجاز: ${PLAN_ORDER.join("، ")}).`
    );
  }
}

/**
 * سازگاری قیمت‌ها:
 * - قیمت صفر فقط برای پلن FREE (وگرنه همان مسیر «خرید رایگان» C2 بدون callback).
 * - قیمت سالانه باید بین «یک ماه» و ۱۳ برابر ماهانه باشد؛ کمتر از ماهانه یعنی
 *   تخفیف منطقی/بیشتر یعنی دادهٔ غلط (نمونهٔ زنده: price 504607 با yearly 13702244).
 */
export function assertPackagePricing(plan: string, price: number, yearlyPrice: number | null | undefined) {
  const planName = normalizePlan(plan);
  if (!Number.isInteger(price) || price < 0) {
    throw new PackageValidationError("قیمت باید عدد صحیح و غیرمنفی باشد.");
  }
  if (price === 0 && planName !== "FREE") {
    throw new PackageValidationError(
      `پکیج پولی (پلن ${planName}) نمی‌تواند رایگان باشد؛ اگر واقعاً رایگان است پلن را FREE قرار دهید.`
    );
  }
  if (yearlyPrice == null) return;
  if (!Number.isInteger(yearlyPrice) || yearlyPrice < 0) {
    throw new PackageValidationError("قیمت سالانه باید عدد صحیح و غیرمنفی باشد.");
  }
  if (price > 0 && yearlyPrice < price) {
    throw new PackageValidationError("قیمت سالانه نمی‌تواند از قیمت ماهانه کمتر باشد.");
  }
  if (price > 0 && yearlyPrice > price * MAX_YEARLY_MULTIPLIER) {
    throw new PackageValidationError(
      `قیمت سالانه (${yearlyPrice.toLocaleString("fa-IR")}) بیش از ${MAX_YEARLY_MULTIPLIER} برابر ماهانه است — احتمالاً اشتباه وارد شده.`
    );
  }
}

export type Actor = { id?: string; phone?: string };

export type PackageInput = {
  name: string;
  plan: string;
  price: number;
  yearlyPrice?: number | null;
  durationDays: number;
  features: StoredFeature[];
  isActive?: boolean;
};

/** نام تکراری باعث می‌شود مشتری در صفحه پکیج‌ها نداند کدام را می‌خرد */
export async function assertPackageNameAvailable(name: string, exceptId?: string | null) {
  const clash = await prisma.package.findFirst({
    where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new PackageConflictError(`پکیژی با نام «${name}» از قبل وجود دارد.`);
}

/**
 * پکیج‌ها برای پنل ادمین، برچسب ماژول‌ها با محدودیت زندهٔ پلن + شمارندۀ اشتراک/سفارش.
 *
 * فیلتر `plan` روی مقدار **نرمال‌شده** انجام می‌شود، نه رشتهٔ خام دیتابیس؛
 * وگرنه ردیف‌های قدیمی/با حروف کوچک در هیچ فیلتری دیده نمی‌شدند.
 */
export async function listPackagesForAdmin(filter?: { plan?: string }) {
  const packages = await prisma.package.findMany({
    orderBy: [{ isActive: "desc" }, { price: "asc" }],
    include: {
      _count: { select: { subscriptions: true, orders: true } },
      orders: { where: { status: "PAID" }, select: { id: true } },
    },
  });
  const wanted = filter?.plan ? normalizePlan(filter.plan) : null;
  const visible = wanted ? packages.filter((p) => normalizePlan(p.plan) === wanted) : packages;

  const plans = [...new Set(visible.map((p) => normalizePlan(p.plan)))];
  const limitsByPlan = Object.fromEntries(
    await Promise.all(plans.map(async (plan) => [plan, await getPlanLimitsForPlan(plan)] as const))
  );

  return visible.map((p) => {
    const plan = normalizePlan(p.plan);
    const { _count, orders, ...rest } = p;
    return {
      ...rest,
      plan,
      subscriptionCount: _count.subscriptions,
      orderCount: _count.orders,
      paidOrderCount: orders.length,
      featureLabels: resolveFeatures(p.features, limitsByPlan[plan]).map((f) => f.label),
    };
  });
}

export async function createPackage(input: PackageInput, actor: Actor) {
  assertKnownPlan(input.plan);
  assertPackagePricing(input.plan, input.price, input.yearlyPrice);
  await assertPackageNameAvailable(input.name);
  const pkg = await prisma.package.create({
    data: {
      name: input.name,
      plan: normalizePlan(input.plan),
      price: input.price,
      yearlyPrice: input.yearlyPrice ?? null,
      durationDays: input.durationDays,
      features: input.features as never,
      isActive: input.isActive ?? true,
    },
  });
  await logAudit({
    actorId: actor.id,
    actorPhone: actor.phone,
    action: "create_package",
    entityType: "Package",
    entityId: pkg.id,
    after: pkg,
  });
  return pkg;
}

export async function updatePackage(id: string, patch: Partial<PackageInput>, actor: Actor) {
  const before = await prisma.package.findUnique({ where: { id } });
  if (!before) return null;

  if (patch.name && patch.name !== before.name) await assertPackageNameAvailable(patch.name, id);

  // اعتبارسنجی فقط وقتی که patch واقعاً به پلن/قیمت دست می‌زند؛ وگرنه ردیف‌های قدیمی
  // با دادهٔ ناسازگار (یافتهٔ A21) حتی با «خاموش/روشن‌کردن» هم ویرایش‌ناپذیر می‌شدند.
  if (patch.plan != null) assertKnownPlan(patch.plan);
  const touchesYearly = patch.yearlyPrice !== undefined;
  if (patch.plan != null || patch.price != null || touchesYearly) {
    assertPackagePricing(
      patch.plan ?? before.plan,
      patch.price ?? asNumber(before.price),
      // نسبت سالانه/ماهانه فقط وقتی سنجیده می‌شود که خودِ قیمت سالانه در این ویرایش
      // باشد؛ وگرنه یک ردیف قدیمیِ ناسازگار اجازهٔ اصلاح قیمت ماهانه را نمی‌داد.
      touchesYearly ? patch.yearlyPrice : undefined
    );
  }

  const updated = await prisma.package.update({
    where: { id },
    data: {
      ...(patch.name != null ? { name: patch.name } : {}),
      ...(patch.plan != null ? { plan: normalizePlan(patch.plan) } : {}),
      ...(patch.price != null ? { price: patch.price } : {}),
      ...(patch.yearlyPrice !== undefined ? { yearlyPrice: patch.yearlyPrice } : {}),
      ...(patch.durationDays != null ? { durationDays: patch.durationDays } : {}),
      ...(patch.features != null ? { features: patch.features as never } : {}),
      ...(patch.isActive != null ? { isActive: patch.isActive } : {}),
    },
  });
  await logAudit({
    actorId: actor.id,
    actorPhone: actor.phone,
    action: "update_package",
    entityType: "Package",
    entityId: id,
    before,
    after: updated,
  });
  return updated;
}

export type DeleteResult =
  | { ok: true; deleted: true; name: string; purgedSubscriptions: number; purgedOrders: number }
  | { ok: true; deactivated: true; name: string; subscriptions: number; orders: number }
  | { ok: false; error: string; status: number };

const fa = (n: number) => n.toLocaleString("fa-IR");

/**
 * حذف پکیج.
 * - بدون آمار وصل‌شده → حذف قطعی.
 * - با اشتراک/سفارش → فقط غیرفعال‌سازی (مگر `force`).
 * - `force` اشتراک‌ها و سفارش‌های **تسویه‌نشده** را هم پاک می‌کند، ولی اگر حتی یک
 *   سفارش پرداخت‌شده وجود داشته باشد رد می‌شود؛ اسناد مالی قابل حذف نیستند.
 */
export async function deletePackage(id: string, actor: Actor, opts: { force?: boolean } = {}): Promise<DeleteResult> {
  const pkg = await prisma.package.findUnique({
    where: { id },
    include: {
      _count: { select: { subscriptions: true, orders: true } },
      orders: { where: { status: "PAID" }, select: { id: true } },
    },
  });
  if (!pkg) return { ok: false, error: "پکیج یافت نشد", status: 404 };

  const linked = pkg._count.subscriptions + pkg._count.orders;

  if (linked === 0) {
    await prisma.package.delete({ where: { id } });
    await logAudit({
      actorId: actor.id,
      actorPhone: actor.phone,
      action: "delete_package",
      entityType: "Package",
      entityId: id,
      before: pkg,
    });
    return { ok: true, deleted: true, name: pkg.name, purgedSubscriptions: 0, purgedOrders: 0 };
  }

  if (!opts.force) {
    const updated = await prisma.package.update({ where: { id }, data: { isActive: false } });
    await logAudit({
      actorId: actor.id,
      actorPhone: actor.phone,
      action: "deactivate_package",
      entityType: "Package",
      entityId: id,
      before: pkg,
      after: updated,
    });
    return {
      ok: true,
      deactivated: true,
      name: pkg.name,
      subscriptions: pkg._count.subscriptions,
      orders: pkg._count.orders,
    };
  }

  if (pkg.orders.length > 0) {
    return {
      ok: false,
      status: 409,
      error:
        `حذف قطعی مجاز نیست: ${fa(pkg.orders.length)} سفارش پرداخت‌شده به این پکیج وصل است ` +
        "و حذفشان درآمد و فاکتورها را از بین می‌برد. همان چیزی که می‌خواهید با «غیرفعال‌سازی» انجام می‌شود.",
    };
  }

  await prisma.$transaction(async (tx) => {
    // ترتیب مهم است: Invoice به Order/Subscription با SetNull اشاره می‌کند و
    // Payment با Cascade پاک می‌شود.
    await tx.subscription.deleteMany({ where: { packageId: id } });
    await tx.order.deleteMany({ where: { packageId: id } });
    await tx.package.delete({ where: { id } });
  });
  await logAudit({
    actorId: actor.id,
    actorPhone: actor.phone,
    action: "force_delete_package",
    entityType: "Package",
    entityId: id,
    before: { name: pkg.name, subscriptions: pkg._count.subscriptions, orders: pkg._count.orders },
  });
  return {
    ok: true,
    deleted: true,
    name: pkg.name,
    purgedSubscriptions: pkg._count.subscriptions,
    purgedOrders: pkg._count.orders,
  };
}
