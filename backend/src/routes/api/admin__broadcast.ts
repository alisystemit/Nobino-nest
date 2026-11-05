// خودکار: پورت‌شده از src/app/api/admin/broadcast/route.ts — بدون تغییر منطق
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { enqueueSms, processPendingNotifications } from "@/lib/notifications/queue";
import { logAudit } from "@/lib/audit";
import { numericSettingOrEnv } from "@/lib/rate-limit-lite";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  message: z.string().trim().min(4).max(600),
  audience: z.enum(["ALL_SALONS", "SALON_OWNERS", "ACTIVE_SUBS"]).default("ALL_SALONS"),
  /** true = فقط شمارش و پیش‌نمایش، چیزی در صف نمی‌گذارد */
  dryRun: z.boolean().optional(),
  /** باید صریحاً true باشد تا ارسال واقعی انجام شود */
  confirm: z.boolean().optional(),
});

const AUDIENCES = ["ALL_SALONS", "SALON_OWNERS", "ACTIVE_SUBS"] as const;
type Audience = (typeof AUDIENCES)[number];

const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL_SALONS: "شمارهٔ همهٔ سالن‌های فعال (و مالکان آن‌ها)",
  SALON_OWNERS: "شمارهٔ مالکان همهٔ سالن‌ها",
  ACTIVE_SUBS: "شمارهٔ سالن‌های دارای اشتراک فعال",
};

/** شمارهٔ مخاطبان هر گروه؛ یکسان‌سازی و حذف شماره‌های تکراری */
async function resolveRecipients(audience: Audience): Promise<string[]> {
  if (audience === "ACTIVE_SUBS") {
    const subs = await prisma.subscription.findMany({
      where: { status: "ACTIVE" },
      select: { salon: { select: { phone: true } } },
      take: 50_000,
    });
    return [...new Set(subs.map((s) => s.salon.phone).filter(Boolean))];
  }
  const salons = await prisma.salon.findMany({
    where: audience === "SALON_OWNERS" ? {} : { isActive: true },
    select: { phone: true, owner: { select: { phone: true } } },
    take: 50_000,
  });
  return [...new Set(salons.flatMap((s) => [s.phone, s.owner?.phone]).filter(Boolean))];
}

function maskPhone(phone: string): string {
  const p = String(phone);
  return p.length <= 8 ? `${p.slice(0, 2)}…` : `${p.slice(0, 4)}…${p.slice(-4)}`;
}

/**
 * «امضای موج»: ترکیب مخاطبان + متن + روز.
 * قبلاً `Date.now()` در کلید بود، پس هر کلیک (حتی تصادفی، روی همان متن و همان
 * مخاطبان) موج تازه‌ای می‌ساخت و صف هیچ‌وقت تکراری را نمی‌گرفت. با هشتگ
 * پایدارِ روزانه، دو فشار پیاپی روی یک متن فقط یک بار پیامک می‌فرستد.
 */
function waveId(audience: Audience, message: string, dayKey: string): string {
  return createHash("sha256").update(`${audience}|${message}|${dayKey}`).digest("hex").slice(0, 32);
}

/** ارسال پیامک سراسری به همه سالن‌ها / مالکان / مشترکین فعال */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = schema.parse(await req.json());

    const dayKey = new Date().toISOString().slice(0, 10);
    const phones = await resolveRecipients(body.audience);
    const alreadyQueued = await prisma.notification.count({
      where: { channel: "SMS", type: "BROADCAST", createdAt: { gte: new Date(`${dayKey}T00:00:00.000Z`) } },
    });

    const cap = await numericSettingOrEnv("broadcast.daily_max_recipients", process.env.BROADCAST_DAILY_MAX, 1000);
    const remaining = cap > 0 ? Math.max(0, cap - alreadyQueued) : phones.length;

    // پیش‌نمایش: هم وقتی `dryRun` آمده، هم وقتی کاربر تأیید نهایی را نفرستاده است
    if (body.dryRun || body.confirm !== true) {
      return json({
        success: true,
        preview: true,
        audience: body.audience,
        audienceLabel: AUDIENCE_LABEL[body.audience],
        recipients: phones.length,
        sample: phones.slice(0, 5).map(maskPhone),
        alreadyQueuedToday: alreadyQueued,
        dailyCap: cap,
        remainingToday: remaining,
        overCap: cap > 0 ? phones.length > remaining : false,
        note: body.confirm === true ? "پیش‌نمایش؛ چیزی ارسال نشد." : "برای ارسال واقعی باید تأیید نهایی بفرستید (confirm: true).",
      });
    }

    if (cap > 0 && phones.length > remaining) {
      return json(
        {
          success: false,
          error: `سقف روزانهٔ پیامک سراسری (${cap.toLocaleString("en-US")} گیرنده) پر شده است؛ امروز ${remaining.toLocaleString("en-US")} عدد باقی مانده و این موج ${phones.length.toLocaleString("en-US")} گیرنده دارد.`,
          remainingToday: remaining,
        },
        { status: 400 },
      );
    }

    const wave = waveId(body.audience, body.message, dayKey);
    let queued = 0;
    let duplicates = 0;
    for (const phone of phones) {
      const res = await enqueueSms({
        type: "BROADCAST",
        recipient: phone,
        message: body.message,
        uniqueKey: `bcast:${wave}:${phone}`,
      });
      if (res.queued) queued++;
      else if (res.reason === "DUPLICATE") duplicates++;
    }
    if (queued > 0) await processPendingNotifications(50).catch(() => {});
    await logAudit({
      actorId: user.id,
      actorPhone: user.phone,
      action: "broadcast",
      entityType: "System",
      after: { audience: body.audience, wave, queued, duplicates, recipients: phones.length },
    });

    return json({
      success: true,
      queued,
      duplicates,
      recipients: phones.length,
      waveId: wave,
      alreadyQueuedToday: alreadyQueued + queued,
      dailyCap: cap,
      remainingToday: cap > 0 ? Math.max(0, cap - alreadyQueued - queued) : null,
    });
  } catch (err) {
    return apiError(err);
  }
}
