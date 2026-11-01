import { Injectable } from '@nestjs/common';

export interface RateCheck {
  ok: boolean;
  retryAfterSec: number;
}

@Injectable()
export class RateLimitMiddlewareService {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  check(key: string, limit: number, windowMs: number): RateCheck {
    const now = Date.now();
    const hit = this.buckets.get(key);
    if (!hit || hit.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (this.buckets.size > 5000) {
        for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
      }
      return { ok: true, retryAfterSec: 0 };
    }
    if (hit.count >= limit) {
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)) };
    }
    hit.count += 1;
    return { ok: true, retryAfterSec: 0 };
  }

  rateKeyFromRequest(ip: string, prefix: string): string {
    return `${prefix}:${ip}`;
  }
}

/** Alias برای سازگاری با import های مهاجرت‌یافته */
export { RateLimitMiddlewareService as RateLimitService };
