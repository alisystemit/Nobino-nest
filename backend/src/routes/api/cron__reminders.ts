// خودکار: پورت‌شده از src/app/api/cron/reminders/route.ts — بدون تغییر منطق
import { prisma } from "@/lib/prisma";
import { requireCronAuth } from "@/lib/auth/cron-guard";
import { enqueueSms, processPendingNotifications } from "@/lib/notifications/queue";
import { renderSmsTemplate } from "@/lib/notifications/templates";
import { sendDueScheduledCampaigns } from "@/lib/notifications/campaign-send";
import { getPlanLimitsForPlan, normalizePlan, type PlanName } from "@/lib/plans/limits";
import { json } from "@/lib/utils";

/**
 * Cron یادآوری نوبت (Vercel Cron - هر ساعت).
 * پنجره‌های یادآوری: ۲۴ ساعت قبل، ۲ ساعت قبل و کمتر از ۱ ساعت مانده.
 * پیام‌ها با uniqueKey تکراری ارسال نمی‌شوند.
 * در همان اجرا کمپین‌های «زمان‌بندی‌شده» که موعدشان رسیده هم ارسال می‌شوند.
 * پلن‌هایی که «یادآوری پیامکی» در ماتریس محدودیت‌ها خاموش است، پیامک نمی‌گیرند.
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
  let planPaused = 0;

  // وضعیت «یادآوری پیامکی» برای هر پلن یک بار محاسبه و کش می‌شود
  const remindersOnByPlan = new Map<PlanName, boolean>();
  const remindersOn = async (planValue: string | null | undefined) => {
    const plan = normalizePlan(planValue);
    const cached = remindersOnByPlan.get(plan);
    if (cached !== undefined) return cached;
    const limits = await getPlanLimitsForPlan(plan);
    remindersOnByPlan.set(plan, limits.smsReminders);
    return limits.smsReminders;
  };

  for (const w of windows) {
    const from = new Date(now.getTime() + w.hours * 60 * 60 * 1000);
    const to = new Date(now.getTime() + (w.hours - 0.5) * 60 * 60 * 1000);
    const appointments = await prisma.appointment.findMany({
      where: {
        status: "CONFIRMED",
        startAt: { gte: to, lte: from },
        // A8: سالنی که تعلیق/غیرفعال شده دیگر نباید برای مشتریانش پیامک یادآوری بفرستد
        salon: { isActive: true, isApproved: true },
      },
      include: { salon: { select: { name: true, plan: true } } },
    });
    candidates += appointments.length;

    for (const a of appointments) {
      if (!(await remindersOn(a.salon.plan))) {
        planPaused++;
        continue;
      }
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

  // کمپین‌های زمان‌بندی‌شده که موعدشان رسیده (خطای این بخش نباید یادآوری‌ها را بخورد)
  let campaigns: { due: number; results: { campaignId: string; sent: number; blocked: number; error?: string }[] } = { due: 0, results: [] };
  try {
    campaigns = await sendDueScheduledCampaigns(now);
  } catch (err) {
    console.error("cron/reminders: ارسال کمپین زمان‌بندی‌شده ناموفق بود", err);
  }

  const result = await processPendingNotifications(20);

  return json({ success: true, candidates, queued, planPaused, scheduledCampaigns: campaigns.due, campaignResults: campaigns.results, ...result });
}