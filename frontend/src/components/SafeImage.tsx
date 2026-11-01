"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import SalonIcon from "@/components/icons/SalonIcon";

/**
 * تصویر با نمایش جایگزین در صورت خطای بارگذاری (لینک شکسته/حذف‌شده).
 * به‌جای آیکون شکستهٔ مرورگر، یک پس‌زمینهٔ گرادیانی و آیکون مربوط (SVG) نشان می‌دهد.
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
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />
  );
}
