"use client";

import { useEffect, useState } from "react";

/** بنر اعلان سراسری (مدیریت‌شده توسط سوپرادمین) */
export default function AnnouncementBanner() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/public/announcement");
        const data = await res.json();
        if (data.success && data.announcement) setText(data.announcement);
      } catch {
        // نادیده گرفتن
      }
    })();
  }, []);

  if (!text) return null;

  return (
    <div className="bg-gradient-to-l from-purple-600 to-pink-600 px-4 py-2.5 text-center text-sm font-medium text-white">
      {text}
    </div>
  );
}
