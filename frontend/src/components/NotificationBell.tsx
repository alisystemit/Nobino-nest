"use client";

import { useEffect, useState } from "react";
import { toJalali } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  payload?: { message?: string } | null;
  readAt?: string | null;
  createdAt: string;
};

/** زنگ اعلان‌های درون‌برنامه‌ای (نوبت، پاسخ پشتیبانی و...) */
export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [authed, setAuthed] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch("/api/notifications", { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json();
          if (!data.success) {
            if (res.status === 401) setAuthed(false);
            return;
          }
          setAuthed(true);
          setItems(data.notifications ?? []);
        })
        .catch(() => {
          /* خطای شبکه — در تلاش بعدی دوباره امتحان می‌شود */
        });
    };
    const timer = setInterval(load, 60_000);
    load();
    return () => clearInterval(timer);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items.some((n) => !n.readAt)) {
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
      fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
    }
  }

  if (!authed) return null;
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 text-base text-neutral-600 transition hover:bg-neutral-200 active:scale-95 dark:bg-neutral-800 dark:text-neutral-300"
        aria-label={`اعلان‌ها${unread ? ` — ${unread} خوانده‌نشده` : ""}`}
        aria-expanded={open}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-600 px-1 text-[10px] font-black text-white">
            {unread > 9 ? "۹+" : unread.toLocaleString("fa-IR")}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="fixed inset-x-3 top-[4.25rem] z-50 max-h-[70dvh] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-2 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 sm:absolute sm:inset-x-auto sm:left-0 sm:top-12 sm:max-h-96 sm:w-80">
            <div className="px-2 py-1.5 text-xs font-bold text-neutral-500">اعلان‌ها</div>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-neutral-400">اعلانی ندارید.</p>
            ) : (
              <ul className="space-y-1">
                {items.map((n) => (
                  <li key={n.id} className={`rounded-xl px-3 py-2 text-sm ${n.readAt ? "text-neutral-500" : "bg-pink-50/60 text-neutral-800 dark:bg-pink-950/20 dark:text-neutral-100"}`}>
                    <p className="leading-relaxed">{n.payload?.message ?? n.type}</p>
                    <span className="mt-1 block text-[10px] text-neutral-400">{toJalali(n.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
