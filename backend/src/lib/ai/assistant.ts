import { prisma } from "@/lib/prisma";
import { llmChat } from "@/lib/ai/llm";

export interface AssistantContext {
  salonId: string;
  customerName?: string;
}

async function buildSalonContext(salonId: string): Promise<string> {
  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    include: { services: { where: { isActive: true } }, staff: { where: { isActive: true }, select: { name: true, title: true, specialties: true } } },
  });
  if (!salon) return "سالن یافت نشد";

  const services = salon.services.map((s) => `${s.name} (${s.durationMin} دقیقه، ${s.price.toLocaleString("fa-IR")} تومان)`).join("؛ ");
  const staff = salon.staff.map((st) => `${st.name}${st.title ? ` (${st.title})` : ""}${st.specialties.length ? ` — ${st.specialties.join("، ")}` : ""}`).join("؛ ");

  return [
    `نام سالن: ${salon.name}`,
    `آدرس: ${salon.city ?? ""} ${salon.address ?? ""}`,
    `توضیحات: ${salon.description ?? ""}`,
    `خدمات: ${services}`,
    `آرایشگران: ${staff}`,
    `قوانین: حداقل ${salon.minNoticeMinutes} دقیقه قبل از رزرو، حداکثر ${salon.maxAdvanceDays} روز بعد، لغو تا ${salon.cancelDeadlineHours} ساعت قبل، بافر ${salon.bufferMinutes} دقیقه بین نوبت‌ها.`,
  ].join("\n");
}

/**
 * دستیار هوشمند رزرو/پاسخ‌گویی.
 * اگر LLM نباشد، با قواعد ساده پاسخ می‌دهد.
 */
export async function assistantReply(question: string, ctx: AssistantContext): Promise<{ reply: string; usedAI: boolean }> {
  const salonCtx = await buildSalonContext(ctx.salonId);

  const system = [
    "تو دستیار نوبت‌دهی سالن زیبایی هستی.",
    "فقط بر اساس اطلاعات زیر پاسخ بده و هرگز قوانین رزرو را دور نزن.",
    "زبان پاسخ فارسی باشد و پاسخ کوتاه و مفید.",
    salonCtx,
  ].join("\n");

  const aiReply = await llmChat([
    { role: "system", content: system },
    { role: "user", content: question },
  ], { temperature: 0.4 });

  if (aiReply) return { reply: aiReply, usedAI: true };

  // ─── fallback قاعده‌محور ───────────────────────────────────────────────
  const q = question.toLowerCase();
  const has = (words: string[]) => words.some((w) => q.includes(w));

  if (has(["قیمت", "هزینه", "چنده", "چقدر"])) {
    const services = await prisma.service.findMany({ where: { salonId: ctx.salonId, isActive: true }, orderBy: { price: "asc" } });
    if (services.length) {
      const list = services.map((s) => `${s.name}: ${s.price.toLocaleString("fa-IR")} تومان`).join("، ");
      return { reply: `قیمت خدمات:\n${list}`, usedAI: false };
    }
  }
  if (has(["ساعت", "وقت", "زمان", "ساعات"])) {
    return { reply: `ساعات کاری سالن مطابق صفحه اصلی است. حداقل ${salonCtx.includes("بافر") ? "برای رزرو، حداقل فاصله و مهلت لغو را رعایت کنید." : ""}`, usedAI: false };
  }
  if (has(["رزرو", "نوبت", "وقت گرفتن"])) {
    return { reply: "برای رزرو، خدمت و آرایشگر و زمان دلخواه را از بخش «رزرو نوبت» انتخاب کنید.", usedAI: false };
  }
  if (has(["لغو", "کنسل", "انصراف"])) {
    return { reply: `طبق قوانین، لغو تا ${salonCtx} مجاز است. از بخش «نوبت‌های من» می‌توانید لغو کنید.`, usedAI: false };
  }
  return { reply: "می‌توانید درباره خدمات، قیمت‌ها، آرایشگران و قوانین رزرو بپرسید.", usedAI: false };
}
