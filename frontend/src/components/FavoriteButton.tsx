"use client";

import { useEffect, useState } from "react";

type State = "loading" | "on" | "off" | "guest";

/**
 * دکمه ذخیره/حذف سالن در علاقه‌مندی‌ها.
 * `onLogin` اختیاری است: صفحه‌هایی که ورود را در شیت خودشان انجام می‌دهند
 * (مثل صفحهٔ سالن روی ساب‌دامین، که مسیر /login را نشان نمی‌دهد) آن را
 * می‌دهند؛ در بقیه همان لینک همیشگی به /login باقی می‌ماند.
 * `sessionKey` هم اگر عوض شود (ورود/خروج)، وضعیت علاقه‌مندی دوباره خوانده می‌شود.
 */
export default function FavoriteButton({
  salonId,
  onLogin,
  sessionKey = "",
}: {
  salonId: string;
  onLogin?: () => void;
  sessionKey?: string;
}) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/favorites");
        if (res.status === 401) {
          if (alive) setState("guest");
          return;
        }
        const data = await res.json();
        if (!data.success) {
          if (alive) setState("guest");
          return;
        }
        const saved = (data.favorites as { salon: { id: string } }[]).some((f) => f.salon.id === salonId);
        if (alive) setState(saved ? "on" : "off");
      } catch {
        if (alive) setState("guest");
      }
    })();
    return () => {
      alive = false;
    };
  }, [salonId, sessionKey]);

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
    const className =
      "inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-xl bg-white/20 text-base font-bold text-white backdrop-blur transition hover:bg-white/30 active:scale-95 sm:w-auto sm:px-4 sm:text-sm";
    const inner = (
      <>
        <span>🤍</span>
        <span className="hidden sm:inline">ورود برای ذخیره سالن</span>
      </>
    );
    if (onLogin) {
      return (
        <button type="button" onClick={onLogin} aria-label="ورود برای ذخیره سالن" className={className} title="ذخیره سالن">
          {inner}
        </button>
      );
    }
    return (
      <a href="/login" aria-label="ورود برای ذخیره سالن" className={className} title="ذخیره سالن">
        {inner}
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
