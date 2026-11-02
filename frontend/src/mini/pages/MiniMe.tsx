/**
 * صفحهٔ «حساب من» مینی‌اپ — ورود/خروج، اتصال حساب پیام‌رسان، لینک ربات‌ها و پشتیبانی.
 */
import { useEffect, useState } from "react";
import LoginSheet from "../components/login-sheet";
import { Button, Field, Icon, Row, SectionTitle } from "../components/ui";
import { PLATFORM_EMOJI, closeMiniApp } from "../lib/bridge";
import { faDigits, normalizePhone } from "../lib/format";
import { mapi, useMini } from "../lib/store";

export default function MiniMe() {
  const { me, authReady, config, platform, platformLabel, messengerName, linkMessenger, logout, toast, profile, saveProfile } = useMini();
  const [loginOpen, setLoginOpen] = useState(false);
  const [counts, setCounts] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!me) return;
    void (async () => {
      const res = await mapi<{ success: boolean; total?: number }>("/api/appointments?limit=1");
      setCounts(res.ok ? (res.data?.total ?? 0) : 0);
    })();
  }, [me]);

  function saveProfileInfo() {
    setSaving(true);
    saveProfile({ name: name.trim(), phone: normalizePhone(phone) });
    setName("");
    setPhone("");
    setSaving(false);
    toast("اطلاعات شما برای رزروهای بعدی ذخیره شد", "ok");
  }

  if (authReady && !me) {
    return (
      <div className="mini-fade">
        <div className="mini-card" style={{ textAlign: "center", padding: 20 }}>
          <div className="mini-avatar" style={{ width: 58, height: 58, margin: "0 auto 12px", fontSize: 24 }}>
            {messengerName ? messengerName.slice(0, 1) : "ن"}
          </div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{messengerName ? `سلام ${messengerName}` : "هنوز وارد نشده‌اید"}</div>
          <p className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
            با یک ورود کوتاه، نوبت‌هایتان در این پیام‌رسان ذخیره می‌شود و دفعهٔ بعد بدون وارد کردن شماره وارد می‌شوید.
          </p>
          <div style={{ marginTop: 12 }}>
            <Button onClick={() => setLoginOpen(true)}>
              <Icon name="user" size={18} />
              ورود / ساخت حساب
            </Button>
          </div>
        </div>
        <LoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} reason="رزرو بدون ورود هم ممکن است، ولی با ورود نوبت‌هایتان این‌جا ذخیره می‌شود." />
        <Platforms />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="mini-card">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="mini-avatar" style={{ fontSize: 19 }}>
            {(me?.name || me?.phone || "ن").slice(0, 2)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{me?.name || "کاربر نوبینو"}</div>
            <div className="mini-option-sub" dir="ltr" style={{ marginTop: 2 }}>
              {me?.phone}
            </div>
          </div>
          <span className="mini-platform-chip">
            {PLATFORM_EMOJI[platform]} {platformLabel}
          </span>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field
            label="نام (برای پیش‌پرکردن فرم رزرو)"
            name="mname"
            value={name || profile.name || me?.name || ""}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً مریم رضایی"
          />
          <Field
            label="شمارهٔ دیگری برای رزرو (اختیاری)"
            name="mphone"
            dir="ltr"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={profile.phone || me?.phone || "09xxxxxxxxx"}
          />
          <Button variant="soft" onClick={saveProfileInfo} loading={saving}>
            ذخیرهٔ اطلاعات
          </Button>
        </div>
      </div>

      {counts !== null ? (
        <div className="mini-stats" style={{ marginTop: 12 }}>
          <div className="mini-stat">
            <b>{faDigits(counts)}</b>
            <span>نوبت ثبت‌شده</span>
          </div>
          <div className="mini-stat">
            <b>{me?.role === "SALON_OWNER" ? "آرایشگر" : me?.role === "ADMIN" ? "مدیر" : "مشتری"}</b>
            <span>نقش حساب</span>
          </div>
        </div>
      ) : null}

      {platform !== "web" ? (
        <>
          <SectionTitle title="ورود خودکار" hint={platformLabel} />
          <div className="mini-card">
            <p className="mini-note" style={{ marginBottom: 12 }}>
              اگر «اتصال» را بزنید، دفعهٔ بعد که از ربات وارد شوید بدون کد پیامکی وارد می‌شوید.
            </p>
            <Button variant="ghost" loading={linking} onClick={async () => {
              setLinking(true);
              await linkMessenger();
              setLinking(false);
            }}>
              <Icon name="link" size={18} />
              اتصال حساب به {platformLabel}
            </Button>
          </div>
        </>
      ) : null}

      <Platforms />

      {config.brand.supportPhone ? (
        <>
          <SectionTitle title="پشتیبانی" />
          <a className="mini-btn ghost" href={`tel:${config.brand.supportPhone}`} style={{ textDecoration: "none" }}>
            <Icon name="phone" size={18} />
            {config.brand.supportPhone}
          </a>
        </>
      ) : null}

      <div style={{ marginTop: 14 }} className="mini-btn-row">
        <Button
          variant="ghost"
          onClick={async () => {
            await logout();
            toast("از حساب خارج شدید", "ok");
          }}
        >
          <Icon name="logout" size={18} />
          خروج
        </Button>
        <Button variant="ghost" onClick={() => closeMiniApp()}>
          <Icon name="close" size={18} />
          بستن
        </Button>
      </div>

      <div className="mini-option-sub" style={{ textAlign: "center", marginTop: 16, lineHeight: 1.9 }}>
        {config.brand.title} — مینی‌اپ پیام‌رسان
      </div>
    </div>
  );
}

/** لینک نصب مینی‌اپ در پیام‌رسان‌های فعال (از تنظیمات سوپرادمین) */
function Platforms() {
  const { config } = useMini();
  const rows = (config.availablePlatforms ?? []).filter((p) => p.enabled);
  if (!rows.length) return null;
  return (
    <>
      <SectionTitle title="ما را در پیام‌رسان‌ها پیدا کنید" />
      <div className="mini-card">
        {rows.map((p) => (
          <div key={p.id} className="mini-row">
            <span>
              {PLATFORM_EMOJI[p.id as keyof typeof PLATFORM_EMOJI] ?? "•"} {p.label}
            </span>
            <span>
              {p.installUrl ? (
                <a className="mini-link" href={p.installUrl} target="_blank" rel="noreferrer">
                  باز کردن
                </a>
              ) : (
                <span style={{ color: "var(--m-muted)" }}>بدون لینک</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
