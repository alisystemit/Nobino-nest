"use client";

import { useEffect, useState } from "react";

type State = "loading" | "on" | "off" | "guest";

/** دکمه ذخیره/حذف سالن در علاقه‌مندی‌ها */
export default function FavoriteButton({ salonId }: { salonId: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/favorites");
        if (res.status === 401) {
          setState("guest");
          return;
        }
        const data = await res.json();
        if (!data.success) {
          setState("guest");
          return;
        }
        const saved = (data.favorites as { salon: { id: string } }[]).some((f) => f.salon.id === salonId);
        setState(saved ? "on" : "off");
      } catch {
        setState("guest");
      }
    })();
  }, [salonId]);

  async function toggle() {
    if (state === "guest" || state === "loading" || busy) return;
    setBusy(true);
    setHint("");
    try {
      const res = await fetch(`/api/favorites/${salonId}`, { method: state === "on" ? "DELETE" : "POST" });
      const data = await res.json();
      if (data.success) {
        setState(state === "on" ? "off" : "on");
        setHint(state === "on" ? "از علاقه‌مندی‌ها حذف شد" : "به علاقه‌مندی‌ها اضافه شد");
      } else {
        setHint(data.error || "خطا");
      }
    } catch {
      setHint("خطا در ارتباط با سرور");
    } finally {
      setBusy(false);
    }
  }

  if (state === "guest") {
    return (
      <a
        href="/login"
        aria-label="ورود برای ذخیره سالن"
        className="inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-xl bg-white/20 text-base font-bold text-white backdrop-blur transition hover:bg-white/30 active:scale-95 sm:w-auto sm:px-4 sm:text-sm"
        title="ذخیره سالن"
      >
        <span>🤍</span>
        <span className="hidden sm:inline">ورود برای ذخیره سالن</span>
      </a>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={toggle}
        disabled={state === "loading" || busy}
        className="inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-xl bg-white/20 text-base font-bold text-white backdrop-blur transition hover:bg-white/30 active:scale-95 disabled:opacity-60 sm:w-auto sm:px-4 sm:text-sm"
        title={state === "on" ? "ذخیره شده" : "ذخیره سالن"}
      >
        <span className="sm:hidden">{state === "on" ? "❤️" : "🤍"}</span>
        <span className="hidden sm:inline">{state === "on" ? "❤️ ذخیره شده" : "🤍 افزودن به علاقه‌مندی‌ها"}</span>
      </button>
      {hint && <span className="text-[11px] text-white/80">{hint}</span>}
    </div>
  );
}
