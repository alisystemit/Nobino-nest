"use client";

import { useEffect, useState } from "react";
import { mapi } from "@/mini/lib/store";

type State = "loading" | "on" | "off" | "guest";

/**
 * دکمه ذخیره/حذف سالن در علاقه‌مندی‌ها.
 * `onLogin` اختیاری است: صفحه‌هایی که ورود را در شیت خودشان انجام می‌دهند
 * (مثل صفحهٔ سالن روی ساب‌دامین، که مسیر /login را نشان نمی‌دهد) آن را
 * می‌دهند؛ در بقیه همان لینک همیشگی به /login باقی می‌ماند.
 * `sessionKey` هم اگر عوض شود (ورود/خروج)، وضعیت علاقه‌مندی دوباره خوانده می‌شود.
 * `signedIn`: اگر صفحه وضعیت نشست را می‌داند، آن را بدهد تا برای مهمان اصلاً
 * درخواست protected فرستاده نشود (کنسولِ بازدیدکنندهٔ صفحهٔ عمومی سالن تمیز بماند).
 * `null` یعنی «هنوز نمی‌دانم» → صبر می‌کنیم؛ `undefined` یعنی رفتار قبلی (پروب کن).
 * درخواست‌ها از `mapi` می‌روند تا توکن Bearer نشست مینی‌اپ هم ارسال شود.
 */
export default function FavoriteButton({
  salonId,
  onLogin,
  sessionKey = "",
  signedIn,
}: {
  salonId: string;
  onLogin?: () => void;
  sessionKey?: string;
  signedIn?: boolean | null;
}) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    let alive = true;
    if (signedIn === null) return;
    if (signedIn === false) {
      setState("guest");
      return;
    }
    (async () => {
      try {
        const res = await mapi<{ success: boolean; favorites?: { salon: { id: string } }[] }>("/api/favorites");
        if (res.status === 401 || !res.ok) {
          if (alive) setState("guest");
          return;
        }
        const saved = (res.data.favorites ?? []).some((f) => f.salon.id === salonId);
        if (alive) setState(saved ? "on" : "off");
      } catch {
        if (alive) setState("guest");
      }
    })();
    return () => {
      alive = false;
    };
  }, [salonId, sessionKey, signedIn]);

  async function toggle() {
    if (state === "guest" || state === "loading" || busy) return;
    setBusy(true);
    setHint("");
    try {
      const res = await mapi<{ success: boolean; error?: string }>(
        `/api/favorites/${salonId}`,
        state === "on" ? { method: "DELETE" } : { method: "POST" }
      );
      if (res.status === 401) {
        setState("guest");
        setHint("برای ذخیره سالن وارد شوید");
        return;
      }
      if (res.ok) {
        setState(state === "on" ? "off" : "on");
        setHint(state === "on" ? "از علاقه‌مندی‌ها حذف شد" : "به علاقه‌مندی‌ها اضافه شد");
      } else {
        setHint(res.data?.error || "خطا");
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
