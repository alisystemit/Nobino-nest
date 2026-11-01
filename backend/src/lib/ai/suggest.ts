import { prisma } from "@/lib/prisma";
import { computeFreeSlots } from "@/lib/bookings/availability";
import { llmChat } from "@/lib/ai/llm";

/** پیشنهاد زمان‌های جایگزین وقتی بازه انتخابی پر است */
export async function suggestAlternatives(params: {
  salonId: string;
  serviceId: string;
  employeeId?: string;
  dayISO: string;
}): Promise<{ slots: { startAt: string; endAt: string }[]; suggestion?: string }> {
  const salon = await prisma.salon.findUnique({ where: { id: params.salonId } });
  const service = await prisma.service.findUnique({ where: { id: params.serviceId } });
  if (!salon || !service) return { slots: [] };

  const nextDays = [params.dayISO];
  // ۳ روز بعد نیز بررسی شود
  for (let i = 1; i <= 3; i++) {
    const d = new Date(params.dayISO + "T00:00:00");
    d.setDate(d.getDate() + i);
    nextDays.push(d.toISOString().slice(0, 10));
  }

  const allSlots = [];
  for (const day of nextDays) {
    const slots = await computeFreeSlots({ salon, services: [service], employeeId: params.employeeId, dayISO: day });
    allSlots.push(...slots.map((s) => ({ day, startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })));
  }

  const suggestion =
    allSlots.length > 0
      ? `زمان‌های جایگزین: ${allSlots.slice(0, 5).map((s) => `${s.day} ساعت ${new Date(s.startAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}`).join("، ")}`
      : undefined;

  return { slots: allSlots.slice(0, 10), suggestion };
}

/** نسخه با LLM برای جمله‌بندی بهتر */
export async function suggestWithAI(alt: { slots: { day: string; startAt: string }[] }): Promise<string> {
  if (!alt.slots.length) return "در چند روز آینده زمان آزادی پیدا نشد.";
  const ai = await llmChat(
    [
      { role: "system", content: "یک جمله فارسی دوستانه پیشنهاد ده که این زمان‌های جایگزین را به مشتری اعلام کند." },
      { role: "user", content: JSON.stringify(alt.slots) },
    ],
    { temperature: 0.5 }
  );
  return ai ?? alt.slots.slice(0, 3).map((s) => `${s.day}`).join("، ");
}
