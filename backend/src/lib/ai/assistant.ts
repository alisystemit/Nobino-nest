import { prisma } from "@/lib/prisma";
import { asNumber } from "@/lib/money";
import { llmChat } from "@/lib/ai/llm";

export interface AssistantContext {
  salonId: string;
  customerName?: string;
}

/**
 * C20: مسیر بدون LLM قبلاً بخشی از «بلوک internal» را داخل حباب چت مشتری می‌ریخت
 * (مثلاً `طبق قوانین، لغو تا ${salonCtx} مجاز است` که کل آدرس و لیست خدمات و
 * قوانین را چاپ می‌کرد). حالا فکت‌های ساخت‌یافته می‌خوانیم و فقط همان عددِ لازم
 * را در جمله می‌گذاریم؛ متن internal هیچ‌وقت به مشتری نمی‌رسد.
 */
type SalonFacts = {
  name: string;
  salonType: string;
  city: string | null;
  address: string | null;
  description: string | null;
  services: { name: string; durationMin: number; price: number }[];
  staff: { name: string; title: string | null; specialties: string[] }[];
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  cancelDeadlineHours: number;
  bufferMinutes: number;
};

async function fetchSalonFacts(salonId: string): Promise<SalonFacts | null> {
  const salon = await prisma.salon.findUnique({
    where: { id: salonId },
    include: {
      services: { where: { isActive: true }, select: { name: true, durationMin: true, price: true }, orderBy: { price: "asc" } },
      staff: { where: { isActive: true }, select: { name: true, title: true, specialties: true } },
    },
  });
  if (!salon) return null;
  return {
    name: salon.name,
    salonType: salon.salonType,
    city: salon.city ?? null,
    address: salon.address ?? null,
    description: salon.description ?? null,
    services: salon.services.map((s) => ({ ...s, price: asNumber(s.price) })),
    staff: salon.staff,
    minNoticeMinutes: salon.minNoticeMinutes,
    maxAdvanceDays: salon.maxAdvanceDays,
    cancelDeadlineHours: salon.cancelDeadlineHours,
    bufferMinutes: salon.bufferMinutes,
  };
}

/** فقط برای system prompt مدل — هرگز در پاسخ به مشتری چاپ نمی‌شود */
function factsToSystemContext(f: SalonFacts): string {
  const services = f.services.map((s) => `${s.name} (${s.durationMin} دقیقه، ${s.price.toLocaleString("fa-IR")} تومان)`).join("؛ ");
  const staff = f.staff.map((st) => `${st.name}${st.title ? ` (${st.title})` : ""}${st.specialties.length ? ` — ${st.specialties.join("، ")}` : ""}`).join("؛ ");
  return [
    `نام سالن: ${f.name}`,
    `آدرس: ${f.city ?? ""} ${f.address ?? ""}`,
    `توضیحات: ${f.description ?? ""}`,
    `خدمات: ${services}`,
    `آرایشگران: ${staff}`,
    `قوانین: حداقل ${f.minNoticeMinutes} دقیقه قبل از رزرو، حداکثر ${f.maxAdvanceDays} روز بعد، لغو تا ${f.cancelDeadlineHours} ساعت قبل، بافر ${f.bufferMinutes} دقیقه بین نوبت‌ها.`,
  ].join("\n");
}

/** رقم فارسی برای متن‌های کاربر */
function fa(n: number): string {
  return n.toLocaleString("fa-IR");
}

/**
 * دستیار هوشمند رزرو/پاسخ‌گویی.
 * اگر LLM نباشد، با قواعد ساده پاسخ می‌دهد.
 */
export async function assistantReply(question: string, ctx: AssistantContext): Promise<{ reply: string; usedAI: boolean }> {
  const facts = await fetchSalonFacts(ctx.salonId);
  if (!facts) return { reply: "اطلاعات این سالن در دسترس نیست.", usedAI: false };

  const kindHint =
    facts.salonType === "MEN"
      ? "این آرایشگاه مردانه است؛ مشتری‌ها آقا هستند و خدمات حول مو، ریش و فید می‌چرخد."
      : facts.salonType === "COUPLE"
        ? "این مجموعه هم بخش مردان و هم بخش بانوان دارد؛ خدمات را با بخش درست مرتبط بدان."
        : "این سالن زیبایی بانوان است.";

  const system = [
    "تو دستیار نوبت‌دهی یک سالن زیبایی/آرایشگاه هستی.",
    kindHint,
    "فقط بر اساس اطلاعات زیر پاسخ بده و هرگز قوانین رزرو را دور نزن.",
    "زبان پاسخ فارسی باشد و پاسخ کوتاه و مفید.",
    "آدرس دقیق یا جزئیات داخلی را تکرار نکن؛ مشتری همان‌ها را در صفحهٔ سالن می‌بیند.",
    factsToSystemContext(facts),
  ].join("\n");

  const aiReply = await llmChat(
    [
      { role: "system", content: system },
      { role: "user", content: question },
    ],
    { temperature: 0.4 }
  );

  if (aiReply) return { reply: aiReply, usedAI: true };

  // ─── fallback قاعده‌محور ───────────────────────────────────────────────
  const q = question.toLowerCase();
  const has = (words: string[]) => words.some((w) => q.includes(w));

  if (has(["قیمت", "هزینه", "چنده", "چقدر"])) {
    if (facts.services.length) {
      const list = facts.services.map((s) => `${s.name}: ${fa(s.price)} تومان`).join("\n");
      return { reply: `قیمت خدمات:\n${list}`, usedAI: false };
    }
    return { reply: "این سالن فعلاً خدمتی با قیمت منتشرشده ندارد.", usedAI: false };
  }
  if (has(["ساعت", "وقت", "زمان", "ساعات"])) {
    return {
      reply:
        `ساعات کاری و روزهای تعطیل در بخش «رزرو نوبت» همین صفحه قابل مشاهده است. ` +
        `نزدیک‌ترین وقت قابل رزرو ${fa(facts.minNoticeMinutes)} دقیقه بعد از الان است و تا ${fa(facts.maxAdvanceDays)} روز آینده باز می‌ماند.`,
      usedAI: false,
    };
  }
  if (has(["رزرو", "نوبت", "وقت گرفتن"])) {
    return { reply: "برای رزرو، خدمت و آرایشگر و زمان دلخواه را از بخش «رزرو نوبت» انتخاب کنید.", usedAI: false };
  }
  if (has(["لغو", "کنسل", "انصراف"])) {
    return {
      reply: `لغو یا تغییر نوبت تا ${fa(facts.cancelDeadlineHours)} ساعت قبل از زمان نوبت آزاد است. از بخش «نوبت‌های من» می‌توانید لغو کنید.`,
      usedAI: false,
    };
  }
  if (has(["آرایشگر", "استیليست", "کارمند", "تیم"])) {
    if (facts.staff.length) {
      return { reply: `تیم ${facts.name}:\n${facts.staff.map((s) => `- ${s.name}${s.title ? ` (${s.title})` : ""}`).join("\n")}`, usedAI: false };
    }
    return { reply: "این سالن عضو تیمی را منتشر نکرده است.", usedAI: false };
  }
  return { reply: "می‌توانید درباره خدمات، قیمت‌ها، آرایشگران و قوانین رزرو بپرسید.", usedAI: false };
}
