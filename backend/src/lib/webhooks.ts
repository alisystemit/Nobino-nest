import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** ارسال یک رویداد به همه وب‌هوک‌های فعال سالن */
export async function dispatchWebhook(salonId: string, event: string, payload: unknown) {
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
