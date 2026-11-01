import { prisma } from "@/lib/prisma";
import { llmChat } from "@/lib/ai/llm";

/** استخراج داده خام تحلیل کسب‌وکار سالن */
export async function getBusinessData(salonId: string) {
  const appointments = await prisma.appointment.findMany({
    where: { salonId },
    select: { startAt: true, status: true, createdAt: true, customerPhone: true },
    take: 5000,
  });

  const total = appointments.length;
  const completed = appointments.filter((a) => a.status === "COMPLETED").length;
  const cancelled = appointments.filter((a) => a.status === "CANCELLED").length;

  // روند درآمد هفتگی (بر اساس نوبت‌های انجام‌شده - تقریبی از خدمات)
  // (در این نسخه ساده، تعداد نوبت در هفته)
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 864e5);
  const thisWeek = appointments.filter((a) => a.createdAt >= weekAgo).length;

  // ساعات شلوغ
  const hourCount: Record<number, number> = {};
  for (const a of appointments) {
    const h = a.startAt.getHours();
    hourCount[h] = (hourCount[h] ?? 0) + 1;
  }
  const peakHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];

  // مشتریان بازگشتی
  const uniquePhones = new Set(appointments.map((a) => a.customerPhone)).size;

  return {
    total,
    completed,
    cancelled,
    cancelRate: total ? Math.round((cancelled / total) * 100) : 0,
    thisWeek,
    peakHour: peakHour ? { hour: Number(peakHour[0]), count: peakHour[1] } : null,
    repeatShare: appointments.length ? Math.round((appointments.length / Math.max(1, uniquePhones)) * 100) : 0,
  };
}

/** تحلیل کسب‌وکار — خلاصه انسان‌خوان با LLM (یا fallback) */
export async function analyzeBusiness(salonId: string): Promise<{ summary: string; usedAI: boolean }> {
  const data = await getBusinessData(salonId);

  const ai = await llmChat(
    [
      {
        role: "system",
        content: "تو تحلیلگر کسب‌وکار سالن زیبایی هستی. بر اساس اعداد داده‌شده یک خلاصه فارسی ۳-۴ خطی با توصیه‌های عملی بده.",
      },
      { role: "user", content: JSON.stringify(data) },
    ],
    { temperature: 0.3 }
  );

  if (ai) return { summary: ai, usedAI: true };

  const peak = data.peakHour ? `ساعت شلوغ: ${data.peakHour.hour}:00 (${data.peakHour.count} نوبت).` : "";
  return {
    summary: `در مجموع ${data.total} نوبت ثبت شده که ${data.completed} انجام و ${data.cancelled} لغو شده است (نرخ لغو ${data.cancelRate}٪). ${data.thisWeek} نوبت در هفته اخیر بوده است. ${peak} حدود ${data.repeatShare}٪ از نوبت‌ها از مشتریان تکراری است؛ افزایش وفاداری و پیامک یادآوری می‌تواند بازگشت را بالا ببرد.`,
    usedAI: false,
  };
}
