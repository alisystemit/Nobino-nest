// خودکار: پورت‌شده از src/app/api/cron/reminders/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { requireCronAuth } from "@/lib/auth/cron-guard";
import { enqueueSms, processPendingNotifications } from "@/lib/notifications/queue";
import { renderSmsTemplate } from "@/lib/notifications/templates";
import { json } from "@/lib/utils";

/**
 * Cron یادآوری نوبت (Vercel Cron - هر ساعت).
 * پنجره‌های یادآوری: ۲۴ ساعت قبل، ۲ ساعت قبل و کمتر از ۱ ساعت مانده.
 * پیام‌ها با uniqueKey تکراری ارسال نمی‌شوند.
 */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const now = new Date();
  const windows = [
    { key: "24h", hours: 24, templateKey: "sms.template.reminder" },
    { key: "2h", hours: 2, templateKey: "sms.template.reminder" },
    { key: "1h", hours: 1, templateKey: "sms.template.reminder" },
  ];

  let queued = 0;
  let candidates = 0;

  for (const w of windows) {
    const from = new Date(now.getTime() + w.hours * 60 * 60 * 1000);
    const to = new Date(now.getTime() + (w.hours - 0.5) * 60 * 60 * 1000);
    const appointments = await prisma.appointment.findMany({
      where: { status: "CONFIRMED", startAt: { gte: to, lte: from } },
      include: { salon: { select: { name: true } } },
    });
    candidates += appointments.length;

    for (const a of appointments) {
      const time = new Intl.DateTimeFormat("fa-IR", { timeStyle: "short" }).format(a.startAt);
      const msg = await renderSmsTemplate(w.templateKey, {
        salon: a.salon.name,
        customer: a.customerName,
        time,
        date: a.startAt.toLocaleDateString("fa-IR"),
      });
      await enqueueSms({
        type: "REMINDER",
        recipient: a.customerPhone,
        message: msg,
        uniqueKey: `reminder:${w.key}:${a.id}`,
        salonId: a.salonId,
      });
      queued++;
    }
  }

  const result = await processPendingNotifications(20);

  return json({ success: true, candidates, queued, ...result });
}