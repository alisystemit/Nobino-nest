"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import SalonIcon from "@/components/icons/SalonIcon";
import { absoluteUrl } from "@/lib/site";

/**
 * تصویر با نمایش جایگزین در صورت خطای بارگذاری (لینک شکسته/حذف‌شده).
 * به‌جای آیکون شکستهٔ مرورگر، یک پس‌زمینهٔ گرادیانی و آیکون مربوط (SVG) نشان می‌دهد.
 * مسیرهای نسبی (مثل /uploads/...) با آدرس مطلق SITE_URL ساخته می‌شوند تا در حالت
 * ساب‌دامین (که میزبان خارجی است) هم فایل به‌درستی بارگذاری شود.
 */
export default function SafeImage({
  src,
  alt,
  className = "",
  fallback = <SalonIcon className="h-10 w-10" />,
  fallbackClassName = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  // مسیرهای نسبی را به آدرس مطلق سایت تبدیل می‌کنیم (سازگار با ساب‌دامین)
  const resolvedSrc = src && /^https?:\/\//i.test(src) ? src : absoluteUrl(src ?? "");

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-gradient-to-br from-pink-100 to-purple-100 text-3xl dark:from-pink-900/30 dark:to-purple-900/30 ${fallbackClassName}`}
      >
        {fallback}
      </span>
    );
  }

  return (
    <img src={resolvedSrc} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />
  );
}
