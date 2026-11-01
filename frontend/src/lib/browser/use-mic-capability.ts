"use client";

import { useSyncExternalStore } from "react";
import { readMicCapability, type MicCapability } from "./capabilities";

/**
 * هوک «امکان میکروفون» — وضعیت واقعی مرورگر را بدون خطر mismatch با سرور می‌خواند.
 *
 * `useSyncExternalStore` در SSR/هیدریشن از `getServerSnapshot` استفاده می‌کند (پاسخ:
 * هنوز نمی‌دانیم) و بعد از هیدریشن `getSnapshot` را صدا می‌زند؛ برای همین لازم نیست
 * setState داخل useEffect بنویسیم و رندر اضافه‌ای هم رخ نمی‌دهد.
 */
let cached: MicCapability | null = null;

function getSnapshot(): MicCapability | null {
  if (!cached) {
    cached = readMicCapability({
      isSecureContext: window.isSecureContext,
      mediaDevices: navigator.mediaDevices ?? null,
      MediaRecorder: (window as unknown as { MediaRecorder?: unknown }).MediaRecorder,
    });
  }
  return cached;
}

/** سمت سرور هیچ مرورگری نیست ⇒ `null` یعنی «هنوز نمی‌دانیم، دکمه را موقتاً غیرفعال نگه دار» */
function getServerSnapshot(): MicCapability | null {
  return null;
}

function subscribe(onChange: () => void): () => void {
  // امکان میکروفون در عمر صفحه عوض نمی‌شود؛ فقط تغییر context (http↔https) می‌تواند آن را جابه‌جا کند
  window.addEventListener("securitycontextchange", onChange);
  return () => window.removeEventListener("securitycontextchange", onChange);
}

export function useMicCapability(): MicCapability | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
