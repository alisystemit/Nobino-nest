"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/next";
import { Link } from "@/next";
import SalonIcon from "@/components/icons/SalonIcon";

const RESEND_SECONDS = 60;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "email" | "code" | "password">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [devCode, setDevCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startCooldown() {
    setCooldown(RESEND_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const usingEmail = step === "email" || email.includes("@");

  /**
   * کد ارسال‌شده را از سرور می‌خواند (در توسعه همیشه؛ در پروداکشن فقط وقتی
   * سوپرادمین سوئیچ «نمایش کدهای ارسالی» را روشن کرده باشد). اگر فعال نباشد
   * سرور ۴۰۴ می‌دهد و چیزی نمایش داده نمی‌شود.
   */
  async function loadSentCode(target: { phone?: string; email?: string }) {
    try {
      const qs = target.email
        ? `email=${encodeURIComponent(target.email)}`
        : `phone=${encodeURIComponent(target.phone ?? "")}`;
      const d = await (await fetch(`/api/auth/otp/dev-last?${qs}`)).json();
      if (d.success && d.code) setDevCode(String(d.code));
    } catch {
      /* سرور کدی نداد — مثل قبل فقط پیام «ارسال شد» نمایش داده می‌شود */
    }
  }

  async function requestOtp() {
    setLoading(true); setError(""); setMsg(""); setDevCode("");
    try {
      const res = await fetch("/api/auth/otp/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
      const data = await res.json();
      if (!data.success) return setError(data.error || "خطا در ارسال کد");
      // در حالت توسعه (یا با سوئیچ پنل) کد را مستقیم روی صفحه نشان بده
      await loadSentCode({ phone });
      setMsg("کد تأیید به شماره شما ارسال شد.");
      setStep("code");
      startCooldown();
    } catch {
      setError("خطا در ارتباط با سرور. اتصال اینترنت را بررسی کنید.");
    } finally {
      setLoading(false);
    }
  }

  async function requestEmailOtp() {
    setLoading(true); setError(""); setMsg(""); setDevCode("");
    try {
      const res = await fetch("/api/auth/email/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!data.success) return setError(data.error || "خطا در ارسال کد");
      await loadSentCode({ email });
      setMsg("کد تأیید به ایمیل شما ارسال شد.");
      setStep("code");
      startCooldown();
    } catch {
      setError("خطا در ارتباط با سرور. اتصال اینترنت را بررسی کنید.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || loading) return;
    setCode("");
    if (usingEmail) await requestEmailOtp();
    else await requestOtp();
  }

  async function verifyCode() {
    setLoading(true); setError("");
    const isEmail = email.includes("@");
    const endpoint = isEmail ? "/api/auth/email/verify" : "/api/auth/otp/verify";
    const payload = isEmail ? { email, code } : { phone, code };
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!data.success) return setError(data.error || "کد صحیح نیست");
      // ورود ادمین به رمز عبور نیاز دارد
      if (data.requiresPassword) {
        setLoginId(data.login ?? (isEmail ? email : phone));
        setPassword("");
        setMsg("برای ورود مدیر، رمز عبور را وارد کنید.");
        setStep("password");
        return;
      }
      // ادمین → پنل سوپرادمین؛ بقیه → داشبورد
      router.push(data.user?.role === "ADMIN" ? "/admin" : "/dashboard");
      router.refresh();
    } catch {
      setError("خطا در ارتباط با سرور. اتصال اینترنت را بررسی کنید.");
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPassword() {
    setLoading(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/auth/password/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginId, password }),
      });
      const data = await res.json();
      if (!data.success) return setError(data.error || "ایمیل/شماره یا رمز عبور اشتباه است");
      router.push(data.user?.role === "ADMIN" ? "/admin" : "/dashboard");
      router.refresh();
    } catch {
      setError("خطا در ارتباط با سرور. اتصال اینترنت را بررسی کنید.");
    } finally {
      setLoading(false);
    }
  }

  const input = "w-full rounded-2xl border border-neutral-200 bg-neutral-50/60 px-4 py-3.5 text-center text-lg font-semibold text-neutral-900 outline-none transition focus:border-pink-400 focus:bg-white focus:ring-4 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-800";

  const stepLabel = step === "phone" ? "شماره موبایل" : step === "email" ? "ایمیل" : step === "password" ? "رمز عبور" : "کد تأیید";

  return (
    <main className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-8 sm:px-6 sm:py-12">
      {/* پس‌زمینه */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-pink-100 via-white to-purple-100" />
      <div className="absolute -left-24 -top-24 -z-10 h-80 w-80 rounded-full bg-pink-300/30 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 -z-10 h-80 w-80 rounded-full bg-purple-300/30 blur-3xl" />

      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl shadow-pink-500/10 sm:rounded-[2.5rem] dark:border-neutral-800 dark:bg-neutral-900 lg:grid-cols-2">
        {/* برند */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-bl from-pink-600 via-rose-600 to-purple-700 p-10 text-white lg:flex">
          <div className="absolute inset-0 bg-hero-pattern" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur"><SalonIcon className="h-6 w-6" /></span>
              <span className="text-xl font-black">نوبینو</span>
            </div>
            <h2 className="mt-8 text-3xl font-black leading-tight">زیبایی شما،<br />برنامه‌ریزی هوشمند</h2>
            <p className="mt-3 text-rose-100/90">نوبت‌دهی صوتی، یادآوری خودکار و مدیریت مالی در یک پلتفرم.</p>
          </div>
          <div className="relative space-y-3 text-sm text-rose-100/90">
            {["🎙️ رزرو با صدای فارسی", "📲 پیامک یادآوری", "📊 گزارش و تحلیل دقیق"].map((f) => (
              <div key={f} className="flex items-center gap-2">{f}</div>
            ))}
          </div>
        </div>

        {/* فرم */}
        <div className="p-5 sm:p-10">
          <h1 className="text-2xl font-black text-neutral-900 dark:text-neutral-100">ورود به نوبینو</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">با {stepLabel} وارد شوید</p>

          <div className="mt-6 space-y-4">
            {step === "phone" && (
              <>
                <input
                  type="tel"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={11}
                  placeholder="09120000000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && phone.length >= 11) requestOtp();
                  }}
                  className={input}
                />
                <button onClick={requestOtp} disabled={loading || phone.length < 11} className="w-full rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 py-3.5 font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.02] disabled:opacity-50">
                  {loading ? "در حال ارسال..." : "دریافت کد"}
                </button>
                <button onClick={() => setStep("email")} className="w-full rounded-lg py-2.5 text-sm font-semibold text-pink-600 hover:underline">
                  ورود با ایمیل به‌جای شماره
                </button>
                <button
                  onClick={() => { setLoginId(phone); setPassword(""); setError(""); setMsg(""); setStep("password"); }}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  ورود با رمز عبور
                </button>
              </>
            )}

            {step === "email" && (
              <>
                <input
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && email.includes("@")) requestEmailOtp();
                  }}
                  className={input}
                />
                <button onClick={requestEmailOtp} disabled={loading || !email.includes("@")} className="w-full rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 py-3.5 font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.02] disabled:opacity-50">
                  {loading ? "در حال ارسال..." : "دریافت کد"}
                </button>
                <button onClick={() => setStep("phone")} className="w-full rounded-lg py-2.5 text-sm font-semibold text-pink-600 hover:underline">
                  ورود با شماره موبایل
                </button>
                <button
                  onClick={() => { setLoginId(email); setPassword(""); setError(""); setMsg(""); setStep("password"); }}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  ورود با رمز عبور
                </button>
              </>
            )}

            {step === "code" && (
              <>
                <input
                  type="tel"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="····"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && code.length >= 4) verifyCode();
                  }}
                  className="w-full rounded-2xl border border-neutral-200 bg-neutral-50/60 px-4 py-4 text-center text-3xl font-black tracking-[0.6em] outline-none transition focus:border-pink-400 focus:bg-white focus:ring-4 focus:ring-pink-100"
                />
                <button onClick={verifyCode} disabled={loading || code.length < 4} className="w-full rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 py-3.5 font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.02] disabled:opacity-50">
                  {loading ? "در حال بررسی..." : "تأیید و ورود"}
                </button>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <button onClick={() => setStep(usingEmail ? "email" : "phone")} className="rounded-lg px-1 py-2 font-semibold text-neutral-500 hover:text-neutral-700">
                    تغییر {usingEmail ? "ایمیل" : "شماره"}
                  </button>
                  <button
                    onClick={resend}
                    disabled={cooldown > 0 || loading}
                    className="rounded-lg px-1 py-2 font-semibold text-pink-600 hover:underline disabled:text-neutral-400 disabled:no-underline"
                  >
                    {cooldown > 0 ? `ارسال دوباره کد تا ${cooldown.toLocaleString("fa-IR")} ثانیه` : "ارسال دوباره کد"}
                  </button>
                </div>
              </>
            )}

            {step === "password" && (
              <>
                <input
                  type="text"
                  dir={loginId.includes("@") ? "ltr" : "rtl"}
                  autoComplete="username"
                  placeholder={loginId.includes("@") ? "you@example.com" : "09120000000"}
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className={input}
                />
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    dir="ltr"
                    autoComplete="current-password"
                    placeholder="رمز عبور"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && loginId.length >= 5 && password.length >= 1) loginWithPassword();
                    }}
                    className={`${input} pl-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-lg text-neutral-400 transition hover:text-neutral-600"
                    aria-label={showPw ? "پنهان کردن رمز" : "نمایش رمز"}
                  >
                    {showPw ? "🙈" : "👁️"}
                  </button>
                </div>
                <button
                  onClick={loginWithPassword}
                  disabled={loading || loginId.length < 5 || password.length < 1}
                  className="w-full rounded-2xl bg-gradient-to-l from-pink-600 to-purple-600 py-3.5 font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.02] disabled:opacity-50"
                >
                  {loading ? "در حال بررسی..." : "ورود"}
                </button>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <button onClick={() => setStep("phone")} className="rounded-lg px-1 py-2 font-semibold text-neutral-500 hover:text-neutral-700">
                    ورود با شماره موبایل
                  </button>
                  <button onClick={() => setStep("email")} className="rounded-lg px-1 py-2 font-semibold text-neutral-500 hover:text-neutral-700">
                    ورود با ایمیل
                  </button>
                </div>
              </>
            )}

            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
            {msg && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{msg}</p>}
            {devCode && (
              <div className="rounded-2xl border-2 border-dashed border-pink-300 bg-pink-50 p-4 text-center dark:border-pink-700 dark:bg-pink-950/30">
                <div className="text-xs font-semibold text-pink-600 dark:text-pink-400">کد تأیید ارسالی (حالت تست)</div>
                <div className="mt-1 text-3xl font-black tracking-[0.4em] text-pink-700 dark:text-pink-300" dir="ltr">
                  {devCode}
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-neutral-400">
            <Link href="/" className="inline-block py-2 text-pink-600 hover:underline">بازگشت به خانه</Link>
            <span className="mx-2 text-neutral-300 dark:text-neutral-600">|</span>
            <Link href="/admin/login" className="inline-block py-2 font-bold text-neutral-500 hover:text-pink-600">ورود سوپرادمین</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
