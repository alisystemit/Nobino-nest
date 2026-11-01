import { prisma } from "@/lib/prisma";
import { enqueueSms } from "@/lib/notifications/queue";

/** ساخت اشتراک پس از پرداخت موفق */
export async function activateSubscription(params: { salonId: string; packageId: string; period: string; autoRenew?: boolean }) {
  const pkg = await prisma.package.findUnique({ where: { id: params.packageId } });
  if (!pkg) throw new Error("پکیج یافت نشد");

  const days = params.period === "YEARLY" ? 365 : pkg.durationDays;
  const startsAt = new Date();
  const endsAt = new Date(Date.now() + days * 864e5);

  await prisma.$transaction([
    prisma.subscription.create({
      data: {
        salonId: params.salonId,
        packageId: params.packageId,
        startsAt,
        endsAt,
        period: params.period,
        autoRenew: params.autoRenew ?? false,
        status: "ACTIVE",
      },
    }),
    prisma.salon.update({
      where: { id: params.salonId },
      data: { plan: pkg.plan, subscriptionEndsAt: endsAt, autoRenew: params.autoRenew ?? false },
    }),
  ]);

  const salon = await prisma.salon.findUnique({ where: { id: params.salonId }, select: { phone: true, name: true } });
  if (salon) {
    await enqueueSms({
      type: "SUBSCRIPTION_ACTIVATED",
      recipient: salon.phone,
      message: `اشتراک «${pkg.name}» برای «${salon.name}» فعال شد تا ${endsAt.toLocaleDateString("fa-IR")}.`,
      uniqueKey: `subactive:${params.salonId}`,
      salonId: params.salonId,
    });
  }

  return { package: pkg.plan, endsAt };
}

/** تمدید خودکار: اگر autoRenew باشد، اشتراک را ۳۰ روز تمدید می‌کنیم */
export async function renewSubscription(subId: string) {
  const sub = await prisma.subscription.findUnique({ where: { id: subId }, include: { package: true, salon: true } });
  if (!sub || sub.status !== "ACTIVE") return null;

  const days = sub.period === "YEARLY" ? 365 : 30;
  const endsAt = new Date(Date.now() + days * 864e5);

  await prisma.$transaction([
    prisma.subscription.update({ where: { id: subId }, data: { endsAt, status: "ACTIVE" } }),
    prisma.salon.update({ where: { id: sub.salonId }, data: { subscriptionEndsAt: endsAt, plan: sub.package.plan } }),
  ]);

  await enqueueSms({
    type: "SUBSCRIPTION_RENEWED",
    recipient: sub.salon.phone,
    message: `اشتراک «${sub.package.name}» برای «${sub.salon.name}» تمدید خودکار شد تا ${endsAt.toLocaleDateString("fa-IR")}.`,
    uniqueKey: `subrenew:${subId}`,
    salonId: sub.salonId,
  });

  return { endsAt };
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
