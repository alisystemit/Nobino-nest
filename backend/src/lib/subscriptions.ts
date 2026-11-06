import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { enqueueSms } from "@/lib/notifications/queue";

/** کلاینت تراکنش — برای نوشتن اتمیک همراه با پرداخت */
type Db = Prisma.TransactionClient;

/**
 * اطلاعات لازم برای اعلان پس از commit. پیامک عمداً داخل تراکنش صف نمی‌شود
 * تا شکست صف/پیامک، پرداخت موفق را rollback نکند.
 */
export type ActivatedSubscription = {
  salonId: string;
  subscriptionId: string;
  package: string;
  packageName: string;
  endsAt: Date;
  salonPhone: string;
  salonName: string;
};

/**
 * نوشتن اشتراک + به‌روزرسانی پلن سالن روی کلاینت تراکنشِ داده‌شده.
 * هیچ I/O بیرونی (پیامک) اینجا انجام نمی‌شود.
 */
export async function activateSubscriptionTx(
  tx: Db,
  params: { salonId: string; packageId: string; period: string; autoRenew?: boolean },
): Promise<ActivatedSubscription> {
  const pkg = await tx.package.findUnique({ where: { id: params.packageId } });
  if (!pkg) throw new Error("پکیج یافت نشد");

  const days = params.period === "YEARLY" ? 365 : pkg.durationDays;
  const startsAt = new Date();
  const endsAt = new Date(Date.now() + days * 864e5);

  const subscription = await tx.subscription.create({
    data: {
      salonId: params.salonId,
      packageId: params.packageId,
      startsAt,
      endsAt,
      period: params.period,
      autoRenew: params.autoRenew ?? false,
      status: "ACTIVE",
    },
  });
  const salon = await tx.salon.update({
    where: { id: params.salonId },
    data: { plan: pkg.plan, subscriptionEndsAt: endsAt, autoRenew: params.autoRenew ?? false },
    select: { phone: true, name: true },
  });

  return {
    salonId: params.salonId,
    subscriptionId: subscription.id,
    package: pkg.plan,
    packageName: pkg.name,
    endsAt,
    salonPhone: salon.phone,
    salonName: salon.name,
  };
}

/** اطلاعات لازم برای اعلان تمدید پس از commit */
export type RenewedSubscription = {
  salonId: string;
  subscriptionId: string;
  packageName: string;
  endsAt: Date;
  salonPhone: string;
  salonName: string;
};

/** صف‌کردن پیامک فعال‌سازی — بیرون از تراکنش و best-effort */
export async function notifyActivatedSubscription(info: ActivatedSubscription) {
  if (!info.salonPhone) return;
  await enqueueSms({
    type: "SUBSCRIPTION_ACTIVATED",
    recipient: info.salonPhone,
    message: `اشتراک «${info.packageName}» برای «${info.salonName}» فعال شد تا ${info.endsAt.toLocaleDateString("fa-IR")}.`,
    uniqueKey: `subactive:${info.subscriptionId}`,
    salonId: info.salonId,
  });
}

/** صف‌کردن پیامک تمدید — بیرون از تراکنش و best-effort */
export async function notifyRenewedSubscription(info: RenewedSubscription) {
  if (!info.salonPhone) return;
  await enqueueSms({
    type: "SUBSCRIPTION_RENEWED",
    recipient: info.salonPhone,
    message: `اشتراک «${info.packageName}» برای «${info.salonName}» تمدید خودکار شد تا ${info.endsAt.toLocaleDateString("fa-IR")}.`,
    uniqueKey: `subrenew:${info.subscriptionId}:${info.endsAt.toISOString()}`,
    salonId: info.salonId,
  });
}

/**
 * تمدید همان اشتراک موجود (بدون ساخت رکورد جدید) روی کلاینت تراکنش.
 *
 * باگ قبلی: مسیر تمدید خودکار هم از `activateSubscription` (که اشتراک
 * **جدید** می‌سازد) استفاده می‌کرد و هم بعدش `renewSubscription` را صدا
 * می‌زد؛ نتیجه دو رکورد ACTIVE و تمدید دوبارهٔ دوره بود.
 *
 * دورهٔ جدید از «بزرگ‌ترینِ اکنون و پایان فعلی» حساب می‌شود تا اگر تمدید
 * چند روز پیش از انقضا انجام شود، روزهای باقی‌مانده سوخت نشود.
 */
export async function renewSubscriptionTx(
  tx: Db,
  subId: string,
): Promise<RenewedSubscription | null> {
  const sub = await tx.subscription.findUnique({
    where: { id: subId },
    include: { package: true, salon: { select: { phone: true, name: true } } },
  });
  if (!sub || sub.status !== "ACTIVE") return null;

  const days = sub.period === "YEARLY" ? 365 : sub.package.durationDays;
  const from = Math.max(Date.now(), sub.endsAt.getTime());
  const endsAt = new Date(from + days * 864e5);

  await tx.subscription.update({ where: { id: subId }, data: { endsAt, status: "ACTIVE" } });
  await tx.salon.update({
    where: { id: sub.salonId },
    data: { subscriptionEndsAt: endsAt, plan: sub.package.plan },
  });

  return {
    salonId: sub.salonId,
    subscriptionId: subId,
    packageName: sub.package.name,
    endsAt,
    salonPhone: sub.salon.phone,
    salonName: sub.salon.name,
  };
}

/**
 * مسیر معمول فعال‌سازی (بدون تراکنش بیرونی):
 * نوشتن اتمیک، سپس صف‌کردن پیامک پس از commit.
 */
export async function activateSubscription(params: {
  salonId: string;
  packageId: string;
  period: string;
  autoRenew?: boolean;
}) {
  const info = await prisma.$transaction((tx) => activateSubscriptionTx(tx, params));
  await notifyActivatedSubscription(info).catch(() => {});
  return { package: info.package, endsAt: info.endsAt };
}

/** تمدید خودکار: اشتراک موجود را یک دوره جلو می‌برد (بدون رکورد جدید) */
export async function renewSubscription(subId: string) {
  const info = await prisma.$transaction((tx) => renewSubscriptionTx(tx, subId), { timeout: 15_000 });
  if (!info) return null;
  await notifyRenewedSubscription(info).catch(() => {});
  return { endsAt: info.endsAt };
}

/** فسخ اشتراک (لغو/تعلیق) */
export async function cancelSubscription(subId: string, reason = "CANCELLED") {
  const sub = await prisma.subscription.findUnique({ where: { id: subId }, include: { salon: true } });
  if (!sub) return null;
  const updated = await prisma.subscription.update({
    where: { id: subId },
    data: { status: reason, cancelledAt: new Date() },
  });
  if (reason === "CANCELLED") {
    await prisma.salon.update({ where: { id: sub.salonId }, data: { plan: "FREE", subscriptionEndsAt: null } });
  }
  return updated;
}
