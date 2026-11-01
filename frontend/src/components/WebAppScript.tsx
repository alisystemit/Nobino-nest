"use client";

import { useEffect } from "react";

/**
 * اسکریپت وب‌اپ پیام‌رسان‌ها.
 * با استفاده از SDK رسمی هر پیام‌رسان (تلگرام، ایتا، بله)،
 * وب‌اپ را «آماده» می‌کند و نمایش تمام‌صفحه را درخواست می‌دهد.
 *
 * تلگرام : window.Telegram.WebApp (تزریق توسط پلتفرم)
 * ایتا   : window.Eitaa?.WebApp
 * بله    : window.Bale?.WebApp
 */
export default function WebAppScript() {
  useEffect(() => {
    const w = window as unknown as {
      Telegram?: { WebApp?: { ready?: () => void; expand?: () => void; colorScheme?: string } };
      Eitaa?: { WebApp?: { ready?: () => void; expand?: () => void } };
      Bale?: { WebApp?: { ready?: () => void; expand?: () => void } };
    };

    const app = w.Telegram?.WebApp ?? w.Eitaa?.WebApp ?? w.Bale?.WebApp;
    if (app) {
      try {
        app.ready?.();
        app.expand?.();
      } catch {
        // نادیده گرفتن خطاهای تعامل با پلتفرم
      }
    }
  }, []);

  return null;
}
