import { Injectable } from '@nestjs/common';
import { getSetting } from '@/lib/settings';

@Injectable()
export class SettingsService {
  /** خواندن یک تنظیم؛ خالی/ناپیدا → null */
  async get(key: string): Promise<string | null> {
    const v = await getSetting(key);
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  }
}
