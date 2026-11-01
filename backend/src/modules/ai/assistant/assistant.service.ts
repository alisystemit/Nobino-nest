import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';

@Injectable()
export class AiAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  async buildSalonContext(salonId: string): Promise<string> {
    const salon = await this.prisma.salon.findUnique({
      where: { id: salonId },
      include: {
        services: { where: { isActive: true } },
        staff: { where: { isActive: true }, select: { name: true, title: true, specialties: true } },
      },
    });

    if (!salon) return 'سالن یافت نشد';

    const services = salon.services.map((s) => `${s.name} (${s.durationMin} دقیقه، ${s.price.toLocaleString('fa-IR')} تومان}`).join('؛ ');
    const staff = salon.staff.map((st) => `${st.name}${st.title ? ` (${st.title})` : ''}${st.specialties.length ? ` — ${st.specialties.join('، ')}` : ''}`).join('؛ ');

    return [
      `نام سالن: ${salon.name}`,
      `آدرس: ${salon.city ?? ''} ${salon.address ?? ''}`,
      `توضیحات: ${salon.description ?? ''}`,
      `خدمات: ${services}`,
      `آرایشگران: ${staff}`,
      `قوانین: حداقل ${salon.minNoticeMinutes} دقیقه قبل از رزرو، حداکثر ${salon.maxAdvanceDays} روز بعد، لغو تا ${salon.cancelDeadlineHours} ساعت قبل، بافر ${salon.bufferMinutes} دقیقه بین نوبت‌ها.`,
    ].join('\n');
  }

  async reply(question: string, ctx: { salonId: string; customerName?: string; history?: { role: 'user' | 'assistant'; content: string }[] }): Promise<{ reply: string; usedAI: boolean }> {
    const salonCtx = await this.buildSalonContext(ctx.salonId);
    const q = question.toLowerCase();
    const has = (words: string[]) => words.some((w) => q.includes(w));

    if (has(['قیمت', 'هزینه', 'چنده', 'چقدر'])) {
      const services = await this.prisma.service.findMany({ where: { salonId: ctx.salonId, isActive: true }, orderBy: { price: 'asc' } });
      if (services.length) {
        const list = services.map((s) => `${s.name}: ${s.price.toLocaleString('fa-IR')} تومان`).join('، ');
        return { reply: `قیمت خدمات:\n${list}`, usedAI: false };
      }
    }
    if (has(['ساعت', 'وقت', 'زمان', 'ساعات'])) {
      return { reply: 'ساعات کاری و روزهای تعطیل در همان صفحهٔ سالن نمایش داده می‌شود؛ موقع رزرو فقط زمان‌های آزاد انتخاب می‌شوند.', usedAI: false };
    }
    if (has(['رزرو', 'نوبت', 'وقت گرفتن'])) {
      return { reply: 'برای رزرو، خدمت و آرایشگر و زمان دلخواه را از بخش «رزرو نوبت» انتخاب کنید.', usedAI: false };
    }
    if (has(['لغو', 'کنسل', 'انصراف'])) {
      return { reply: 'برای لغو، از بخش «نوبت‌های من» اقدام کنید؛ طبق قوانین سالن لغو تا مهلت مشخص‌شده رایگان است.', usedAI: false };
    }
    return { reply: 'می‌توانید درباره خدمات، قیمت‌ها، آرایشگران و قوانین رزرو بپرسید.', usedAI: false };
  }
}
