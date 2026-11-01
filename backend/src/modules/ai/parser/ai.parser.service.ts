import { Injectable } from '@nestjs/common';
import { cleanGeneratedText } from '../llm/llm-helpers';

export type ExtractedAppointment = {
  name?: string;
  phone?: string;
  service?: string;
  date?: string;
  time?: string;
  note?: string;
  rawText: string;
};

export type ExtractedField = 'name' | 'phone' | 'service' | 'date' | 'time';

@Injectable()
export class AiParserService {
  async extractSingleField(
    field: ExtractedField,
    text: string,
    opts?: { timezone?: string; serviceNames?: string[] },
  ): Promise<ExtractedAppointment> {
    const base: ExtractedAppointment = { rawText: text };

    switch (field) {
      case 'phone': {
        const p = this.extractPhone(text);
        if (p) return { ...base, phone: p };
        break;
      }
      case 'time': {
        const t = this.extractTime(text);
        if (t) return { ...base, time: t };
        break;
      }
      case 'date': {
        const d = this.resolveDate(text, opts?.timezone);
        if (d) return { ...base, date: d };
        break;
      }
      case 'service': {
        const s = this.extractService(text, opts?.serviceNames);
        if (s) return { ...base, service: s };
        break;
      }
      case 'name': {
        const n = this.extractName(text);
        if (n) return { ...base, name: n };
        const cleaned = text.replace(/[۰-۹0-9+\-:.,;،؛?!؟]/g, '').trim();
        const words = cleaned.split(/\s+/).filter(Boolean);
        if (words.length >= 1 && words.length <= 4 && cleaned.length >= 3) {
          return { ...base, name: cleaned.replace(/^(سلام|مشتری|من)\s+/i, '') };
        }
        break;
      }
    }
    return base;
  }

  async extractAppointment(text: string, opts?: { timezone?: string; serviceNames?: string[] }): Promise<ExtractedAppointment> {
    const base: ExtractedAppointment = { rawText: text };
    base.name = this.extractName(text);
    base.phone = this.extractPhone(text);
    base.time = this.extractTime(text);
    base.service = this.extractService(text, opts?.serviceNames);
    const date = this.resolveDate(text, opts?.timezone);
    if (date) base.date = date;
    return base;
  }

  pickStringFields(raw: unknown, allowed: readonly string[]): Record<string, string> {
    const out: Record<string, string> = {};
    if (!raw || typeof raw !== 'object') return out;
    const obj = raw as Record<string, unknown>;
    for (const key of allowed) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) out[key] = v.trim();
    }
    return out;
  }

  extractName(text: string): string | undefined {
    return undefined;
  }

  extractPhone(text: string): string | undefined {
    const match = text.match(/(?:^|\s)(0?9\d{9})(?:\s|$)/);
    if (match) {
      return match[1].startsWith('0') ? match[1] : `0${match[1]}`;
    }
    return undefined;
  }

  extractTime(text: string): string | undefined {
    const match = text.match(/(\d{1,2})[:\s]+(\d{2})/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      }
    }
    return undefined;
  }

  extractService(text: string, serviceNames?: string[]): string | undefined {
    if (serviceNames?.length) {
      for (const name of serviceNames) {
        const simple = name.replace(/[^\u0600-\u06FF\s]/g, '').trim();
        if (simple.length >= 3 && text.includes(simple)) return name;
      }
    }
    return undefined;
  }

  resolveDate(text: string, timezone = 'Asia/Tehran'): string | undefined {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (/امروز/.test(text)) return today.toISOString().slice(0, 10);
    if (/فردا/.test(text)) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    if (/پس\s?فردا/.test(text)) {
      const d = new Date(today);
      d.setDate(d.getDate() + 2);
      return d.toISOString().slice(0, 10);
    }

    const dayNames = { شنبه: 0, 'یکشنبه': 1, دوشنبه: 2, سه‌شنبه: 3, 'چهارشنبه': 4, پنجشنبه: 5, جمعه: 6 };

    for (const [name, target] of Object.entries(dayNames)) {
      if (text.includes(name)) {
        const todayDay = today.getDay();
        let diff = (target - todayDay + 7) % 7;
        if (diff === 0 && !/این|همین/.test(text)) diff = 7;
        const d = new Date(today);
        d.setDate(d.getDate() + diff);
        return d.toISOString().slice(0, 10);
      }
    }

    const match = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      if (y > 1900) {
        return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
      }
    }

    return undefined;
  }
}
