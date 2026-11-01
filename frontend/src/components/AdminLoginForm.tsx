"use client";

import { useState } from "react";
import { useRouter } from "@/router-shim";
import Link from "@/router-shim";
import SalonIcon from "@/components/icons/SalonIcon";

const input =
  "w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20";

/**
 * فرم ورود سوپرادمین — فقط ایمیل و رمز عبور، بدون شماره موبایل و بدون پیامک.
 * مسیر API: /api/admin/auth/login (فقط نقش ADMIN)
 */
export default function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      setError(data?.error || "ورود ناموفق بود. دوباره تلاش کنید.");
    } catch {
      setError("خطا در ارتباط با سرور. اتصال اینترنت را بررسی کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-7 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-600 to-purple-600 text-white shadow-lg shadow-pink-900/40">
              <SalonIcon className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-lg font-black text-neutral-50">ورود سوپرادمین</h1>
              <p className="text-xs text-neutral-400">پنل مدیریت نوبینو — با ایمیل و رمز عبور</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-6 grid gap-3" noValidate>
            <label className="grid gap-1.5 text-xs font-bold text-neutral-300">
              ایمیل مدیر
              <input
                type="email"
                dir="ltr"
                autoComplete="username"
                required
                className={input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@nobino.ir"
              />
            </label>

            <label className="grid gap-1.5 text-xs font-bold text-neutral-300">
              رمز عبور
              <span className="relative block">
                <input
                  type={showPw ? "text" : "password"}
                  dir="ltr"
                  autoComplete="current-password"
                  required
                  className={`${input} pl-16`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-bold text-neutral-400 transition hover:text-neutral-100"
                  aria-label={showPw ? "پنهان‌کردن رمز" : "نمایش رمز"}
                >
                  {showPw ? "پنهان" : "نمایش"}
                </button>
              </span>
            </label>

            {error && (
              <p className="rounded-xl bg-red-950/60 px-4 py-3 text-sm text-red-300 ring-1 ring-red-900" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !email.includes("@") || password.length < 1}
              className="mt-1 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-pink-900/30 transition hover:opacity-95 disabled:opacity-50"
            >
              {busy ? "در حال بررسی…" : "ورود به پنل"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs text-neutral-400">
            <Link href="/login" className="font-bold text-pink-400 hover:underline">
              ورود کاربران و آرایشگاه‌ها ←
            </Link>
            <span>ورود با پیامک برای مدیران لازم نیست</span>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] leading-6 text-neutral-500">
          پس از چند تلاش ناموفق، ورود برای ۱۰ دقیقه قفل می‌شود.
          <br />
          اگر رمز را فراموش کرده‌اید روی سرور: <code dir="ltr">node scripts/reset-admin-password.mjs</code>
        </p>
      </div>
    </main>
  );
}
