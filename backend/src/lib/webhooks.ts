import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isWebhookTargetAllowed } from "@/lib/webhook-target";

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** ارسال یک رویداد به همه وب‌هوک‌های فعال سالن */
export async function dispatchWebhook(salonId: string, event: string, payload: unknown) {
  // A8: سالنی که سوپرادمین آن را غیرفعال/تعلیق کرده نباید همچنان رویداد بیرونی
  // بفرستد (وب‌هوک‌های فعالش در دیتابیس دست‌نخورده می‌مانند و پس از فعال‌شدن
  // دوباره کار می‌کنند).
  const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { isActive: true, isApproved: true } });
  if (!salon || !salon.isActive || !salon.isApproved) return;

  const configs = await prisma.webhookConfig.findMany({
    where: { salonId, isActive: true, events: { has: event } },
  });

  for (const cfg of configs) {
    const delivery = await prisma.webhookDelivery.create({
      data: { configId: cfg.id, event, payload: payload as never, status: "PENDING" },
    });
    await attemptDelivery(delivery.id, cfg);
  }
}

export async function attemptDelivery(deliveryId: string, cfg: { url: string; secret?: string | null }) {
  try {
    const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) return;
    // O7: آدرس‌هایی که پیش از این محافظت در دیتابیس مانده‌اند (یا بعداً به
    // مقصد داخلی تغییر کرده‌اند) ارسال نمی‌شوند؛ وگرنه رکورد قدیمی همچنان SSRF است.
    const problem = isWebhookTargetAllowed(cfg.url);
    if (problem) {
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: "FAILED", attempts: { increment: 1 }, lastError: `مقصد داخلی رد شد: ${problem}`.slice(0, 300) },
      });
      return;
    }
    const text = JSON.stringify({ event: delivery.event, data: delivery.payload, ts: Date.now() });
    const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "Nobino-Webhook/1.0" };
    if (cfg.secret) headers["X-Nobino-Signature"] = sign(text, cfg.secret);

    const res = await fetch(cfg.url, { method: "POST", headers, body: text });
    const ok = res.ok;
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: ok ? "SUCCESS" : "FAILED", responseStatus: res.status, attempts: { increment: 1 }, lastError: ok ? null : `HTTP ${res.status}` },
    });
  } catch (e) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "FAILED", attempts: { increment: 1 }, lastError: e instanceof Error ? e.message.slice(0, 300) : String(e) },
    });
  }
}
