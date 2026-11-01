import { prisma } from "@/lib/prisma";
import { llmChat } from "@/lib/ai/llm";

export type ContentType = "service_description" | "staff_bio" | "promo";

/** تولید محتوا (توضیح خدمت، بیو کارمند، پیام تبلیغاتی) با LLM یا fallback */
export async function generateContent(opts: { type: ContentType; salonId: string; targetId: string }): Promise<{ text: string; usedAI: boolean }> {
  const salon = await prisma.salon.findUnique({ where: { id: opts.salonId } });

  const ai = await llmChat(
    [
      {
        role: "system",
        content: "تو کپی‌رایتر سالن زیبایی هستی. فقط بر اساس اطلاعات داده‌شده متن کوتاه و جذاب فارسی بنویس (حداکثر ۲-۳ جمله).",
      },
      { role: "user", content: JSON.stringify({ type: opts.type, salon: salon?.name, targetId: opts.targetId }) },
    ],
    { temperature: 0.7 }
  );

  if (ai) return { text: ai, usedAI: true };

  if (opts.type === "service_description") {
    const svc = await prisma.service.findUnique({ where: { id: opts.targetId } });
    if (svc) {
      return { text: `${svc.name} در «${salon?.name}» با کیفیت بالا در ${svc.durationMin} دقیقه ارائه می‌شود. برای رزرو همین حالا اقدام کنید.`, usedAI: false };
    }
  }
  if (opts.type === "staff_bio") {
    const st = await prisma.staff.findUnique({ where: { id: opts.targetId } });
    if (st) {
      const specs = st.specialties.length ? `متخصص در ${st.specialties.join("، ")}` : "";
      return { text: `${st.name}${st.title ? ` (${st.title})` : ""} ${specs} — آماده ارائه بهترین خدمات به شما در «${salon?.name}».`, usedAI: false };
    }
  }
  if (opts.type === "promo") {
    return { text: `به «${salon?.name}» خوش آمدید! همین حالا نوبت خود را رزرو کنید و از خدمات حرفه‌ای ما لذت ببرید.`, usedAI: false };
  }
  return { text: "محتوا تولید شد.", usedAI: false };
}
