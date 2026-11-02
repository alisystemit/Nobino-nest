/**
 * ورود با کد پیامکی (OTP) داخل شیت پایین — همان endpoint های سایت.
 * بعد از ورود، اگر کاربر در پیام‌رسان باشد و ورود بی‌حس روشن باشد، حساب
 * پیام‌رسان هم متصل می‌شود تا دفعهٔ بعد بدون کد وارد شود.
 */
import { useEffect, useState } from "react";
import { Button, Field, Sheet } from "./ui";
import { isPhone, normalizePhone } from "../lib/format";
import { mapi, useMini, writeToken, type MiniUser } from "../lib/store";
import { PLATFORM_EMOJI, PLATFORM_LABEL } from "../lib/bridge";

type Step = "phone" | "code";

export default function LoginSheet({ open, onClose, reason }: { open: boolean; onClose: () => void; reason?: string }) {
  const { platform, refreshMe, linkMessenger, toast, config } = useMini();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [devCode, setDevCode] = useState("");

  useEffect(() => {
    if (!open) {
      setStep("phone");
      setCode("");
      setError("");
      setDevCode("");
      setBusy(false);
    }
  }, [open]);

  async function sendCode() {
    const p = normalizePhone(phone);
    if (!isPhone(p)) {
      setError("شماره موبایل باید با ۰۹ شروع شود");
      return;
    }
    setBusy(true);
    setError("");
    const res = await mapi<{ success: boolean; error?: string }>("/api/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone: p }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.data?.error || "ارسال کد ممکن نشد");
      return;
    }
    setStep("code");
    toast("کد تأیید ارسال شد", "ok");
    // در توسعه (یا با سوئیچ پنل) کد را نشان می‌دهیم تا تست ساده بماند
    const dev = await mapi<{ code?: string | null }>(`/api/auth/otp/dev-last?phone=${encodeURIComponent(p)}`);
    if (dev.ok && dev.data?.code) setDevCode(dev.data.code);
  }

  async function verify() {
    if (code.length < 4) {
      setError("کد ۴ رقمی را وارد کنید");
      return;
    }
    setBusy(true);
    setError("");
    const res = await mapi<{ success: boolean; token?: string; user?: MiniUser; error?: string; requiresPassword?: boolean }>(
      "/api/auth/otp/verify",
      { method: "POST", body: JSON.stringify({ phone: normalizePhone(phone), code }) }
    );
    setBusy(false);
    if (!res.ok || !res.data?.user) {
      setError(res.data?.requiresPassword ? "این حساب باید با رمز عبور وارد شود؛ از نسخهٔ وب استفاده کنید" : res.data?.error || "کد اشتباه یا منقضی شده است");
      return;
    }
    writeToken(res.data.token ?? "");
    await refreshMe();
    // اتصال بی‌صدا به حساب پیام‌رسان (فقط اگر پیام‌رسان امضای استاندارد بدهد)
    if (platform !== "web" && config.features.silentLogin) {
      const p = config.availablePlatforms?.find((x) => x.id === platform);
      if (!p || p.silentLogin) await linkMessenger();
    }
    toast(`خوش آمدید${res.data.user.name ? "، " + res.data.user.name : ""}`, "ok");
    onClose();
  }

  return (
    <Sheet open={open} title="ورود به نوبینو" onClose={onClose}>
      {reason ? <div className="mini-note" style={{ marginBottom: 12 }}>{reason}</div> : null}

      {step === "phone" ? (
        <>
          <Field
            label="شماره موبایل"
            name="phone"
            inputMode="numeric"
            autoComplete="tel"
            dir="ltr"
            placeholder="09123456789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            hint="کد تأیید ۴ رقمی پیامک می‌شود."
          />
          {error ? <div className="mini-note" style={{ color: "#b91c1c", marginBottom: 10 }}>{error}</div> : null}
          <Button onClick={sendCode} loading={busy}>
            دریافت کد
          </Button>
        </>
      ) : (
        <>
          <Field
            label="کد تأیید"
            name="code"
            className="mini-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={4}
            placeholder="۱۲۳۴"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
          {devCode ? (
            <div className="mini-note" style={{ marginBottom: 10 }}>
              کد این شماره در حالت توسعه: <b style={{ letterSpacing: 3 }}>{devCode}</b>
            </div>
          ) : null}
          {error ? <div className="mini-note" style={{ color: "#b91c1c", marginBottom: 10 }}>{error}</div> : null}
          <div className="mini-btn-row">
            <Button variant="ghost" onClick={() => setStep("phone")}>
              ویرایش شماره
            </Button>
            <Button onClick={verify} loading={busy}>
              ورود
            </Button>
          </div>
        </>
      )}

      {platform !== "web" ? (
        <div className="mini-option-sub" style={{ marginTop: 14, textAlign: "center" }}>
          {PLATFORM_EMOJI[platform]} {PLATFORM_LABEL[platform]} — با یک بار ورود، دفعهٔ بعد خودکار وارد می‌شوید.
        </div>
      ) : null}
    </Sheet>
  );
}
