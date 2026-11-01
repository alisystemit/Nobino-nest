import { Injectable } from '@nestjs/common';
import { prisma } from '@/lib/prisma';

@Injectable()
export class AiSuggestService {
  async suggestAlternatives(opts: { salonId: string; serviceId: string; dayISO: string; employeeId?: string }) {
    const { salonId, serviceId, dayISO } = opts;
    const day = new Date(dayISO);
    if (Number.isNaN(day.getTime())) return { suggestions: [], message: 'تاریخ نامعتبر است' };

    const service = await prisma.service.findFirst({ where: { id: serviceId, salonId } });
    if (!service) return { suggestions: [], message: 'خدمت یافت نشد' };

    const startOfDay = new Date(day);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 59, 999);

    const booked = await prisma.appointment.findMany({
      where: { salonId, startAt: { gte: startOfDay, lte: endOfDay } },
      select: { startAt: true },
    });
    const used = new Set(booked.map((b) => b.startAt.getTime()));

    const slots: string[] = [];
    for (let h = 9; h < 20; h++) {
      const t = new Date(day);
      t.setHours(h, 0, 0, 0);
      if (!used.has(t.getTime())) slots.push(`${String(h).padStart(2, '0')}:00`);
    }

    return { suggestions: slots.slice(0, 5), message: '' };
  }
}
