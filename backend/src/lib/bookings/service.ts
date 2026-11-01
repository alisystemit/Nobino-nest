import type { Service } from "@prisma/client";

export type ServiceStep = { name: string; durationMin: number };

/**
 * مدت‌زمان مؤثر یک خدمت:
 * اگر خدمت چندمرحله‌ای باشد (steps)، مجموع مدت مرحله‌ها ملاک است؛ در غیر این صورت durationMin.
 */
export function serviceDuration(service: Pick<Service, "durationMin" | "steps">): number {
  const steps = (service.steps as ServiceStep[] | null) ?? null;
  if (Array.isArray(steps) && steps.length > 0) {
    const total = steps.reduce((sum, s) => sum + (Number(s.durationMin) || 0), 0);
    if (total > 0) return total;
  }
  return service.durationMin;
}

/** قیمت مجموع چند خدمت (برای رزرو چند خدمت) */
export function servicesTotalDuration(services: Pick<Service, "durationMin" | "steps">[]): number {
  return services.reduce((sum, svc) => sum + serviceDuration(svc), 0);
}

export type BookableService = Pick<Service, "durationMin" | "steps"> &
  Partial<Pick<Service, "bufferMin" | "price">>;

/**
 * بافر مؤثر برای یک یا چند خدمت:
 * اگر یکی از خدمت‌ها بافر اختصاصی داشته باشد، بزرگ‌ترین بافر ملاک است؛
 * وگرنه بافر پیش‌فرض سالن استفاده می‌شود.
 */
export function effectiveBuffer(
  services: Pick<Service, "bufferMin">[],
  salonBufferMinutes: number
): number {
  const specific = services.reduce((max, s) => Math.max(max, Number(s.bufferMin) || 0), 0);
  return specific > 0 ? specific : salonBufferMinutes;
}

/**
 * اطلاعات ترکیبی یک رزرو چندخدمتی:
 * مجموع مدت، مجموع قیمت و بزرگ‌ترین بافر اختصاصی خدمات.
 */
export function combinedBooking(services: BookableService[]): {
  durationMin: number;
  price: number;
  bufferMin: number;
} {
  const durationMin = servicesTotalDuration(services);
  const price = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const bufferMin = services.reduce((max, s) => Math.max(max, Number(s.bufferMin) || 0), 0);
  return { durationMin, price, bufferMin };
}
