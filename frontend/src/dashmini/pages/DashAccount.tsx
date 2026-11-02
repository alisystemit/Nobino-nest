/**
 * حساب من — نسخهٔ مینی‌استایل: پروفایل، رمز عبور، نشست‌های فعال، تم، خروج و
 * (برای سوپرادمین) انتخاب سبک داشبورد.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field, Icon, Row, SectionTitle, Sheet, SkeletonList } from "@/mini/components/ui";
import { fromNow } from "@/mini/lib/format";
import { dapi } from "../lib/api";
import { useDash } from "../lib/store";
import { requestClassic } from "../lib/store";

type SessionRow = { id: string; device: string | null; ip: string | null; createdAt: string; current?: boolean };

export default function DashAccount() {
  const navigate = useNavigate();
  const { me, isSuperAdmin, salonId, salonStyleOverride, setSalonStyleOverride, toast, refreshMe } = useDash();

  const [name, setName] = useState(me?.name ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [saving, setSaving] = useState(false);

  const [passOpen, setPassOpen] = useState(false);
  const [nextPass, setNextPass] = useState("");
  const [currentPass, setCurrentPass] = useState("");
  const [passBusy, setPassBusy] = useState(false);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    setName(me?.name ?? "");
    setEmail(me?.email ?? "");
  }, [me?.name, me?.email]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    const res = await dapi<{ success: boolean; sessions?: SessionRow[] }>("/api/auth/sessions?limit=20");
    setSessions(res.ok ? res.data?.sessions ?? [] : []);
    setSessionsLoading(false);
  }, []);

  async function saveProfile() {
    setSaving(true);
    const res = await dapi<{ success: boolean; error?: string }>("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() || undefined, email: email.trim() || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      toast(res.data?.error || "ذخیرهٔ پروفایل ممکن نشد", "error");
      return;
    }
    toast("پروفایل ذخیره شد", "ok");
    await refreshMe();
  }

  async function savePassword() {
    if (nextPass.length < 8) {
      toast("رمز جدید باید حداقل ۸ کاراکتر باشد", "error");
      return;
    }
    setPassBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>("/api/auth/password/set", {
      method: "POST",
      body: JSON.stringify({ password: nextPass, ...(currentPass ? { currentPassword: currentPass } : {}) }),
    });
    setPassBusy(false);
    if (!res.ok) {
      toast(res.data?.error || "تغییر رمز ممکن نشد", "error");
      return;
    }
    setPassOpen(false);
    setNextPass("");
    setCurrentPass("");
    toast("رمز جدید ذخیره شد", "ok");
  }

  async function revoke(id: string) {
    const res = await dapi<{ success: boolean; error?: string }>(`/api/auth/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      toast(res.data?.error || "بستن نشست ممکن نشد", "error");
      return;
    }
    toast("نشست بسته شد", "ok");
    await loadSessions();
  }

  async function signOut() {
    await dapi("/api/auth/logout", { method: "POST" });
    navigate("/login");
  }

  function toggleTheme() {
    const root = document.getElementById("dash-theme-root");
    const html = document.documentElement;
    const dark = !html.classList.contains("dark");
    html.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      /* حالت خصوصی */
    }
    if (root) root.classList.toggle("dark", dark);
  }

  if (!me) {
    return (
      <div className="mini-fade">
        <div className="mini-card">
          <div style={{ fontWeight: 900, marginBottom: 6 }}>وارد نشده‌اید</div>
          <div className="mini-option-sub" style={{ lineHeight: 1.9 }}>
            برای دیدن حساب کاربری وارد شوید.
          </div>
          <div style={{ marginTop: 10 }}>
            <Button onClick={() => navigate("/login")}>ورود</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <SectionTitle title="پروفایل" hint={me.phone} />
      <div className="mini-card">
        <Field label="نام" name="dash_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="نام و نام خانوادگی" />
        <Field label="ایمیل" name="dash_email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <div style={{ marginTop: 10 }}>
          <Button loading={saving} onClick={() => void saveProfile()}>
            <Icon name="check" size={17} />
            ذخیرهٔ پروفایل
          </Button>
        </div>
      </div>

      <SectionTitle title="ورود و امنیت" />
      <div className="mini-list">
        <button type="button" className="mini-item" onClick={() => setPassOpen(true)}>
          <span className="mini-item-main">
            <span className="mini-item-title">تغییر رمز عبور</span>
            <span className="mini-item-sub">حداقل ۸ کاراکتر</span>
          </span>
          <Icon name="edit" size={17} />
        </button>
        <button
          type="button"
          className="mini-item"
          onClick={() => {
            setSessionsOpen(true);
            void loadSessions();
          }}
        >
          <span className="mini-item-main">
            <span className="mini-item-title">نشست‌های فعال</span>
            <span className="mini-item-sub">دستگاه‌هایی که با حساب شما باز هستند</span>
          </span>
          <Icon name="users" size={17} />
        </button>
        <button type="button" className="mini-item" onClick={toggleTheme}>
          <span className="mini-item-main">
            <span className="mini-item-title">تم روشن / تیره</span>
            <span className="mini-item-sub">همراه با بقیهٔ سایت ذخیره می‌شود</span>
          </span>
          <Icon name="sparkle" size={17} />
        </button>
      </div>

      {isSuperAdmin ? (
        <>
          <SectionTitle title="سبک داشبورد" hint={salonId ? "همین سالن" : "سالنی را انتخاب کنید"} />
          <div className="mini-card">
            <div className="mini-option-sub" style={{ lineHeight: 1.9, marginBottom: 10 }}>
              پیش‌فرض همهٔ سالن‌ها از «تنظیمات سیستم → سبک داشبورد سالن» تعیین می‌شود؛ اینجا می‌توانید همین سالن را استثنا کنید.
            </div>
            <div className="mini-chips">
              <button type="button" className={`mini-chip${salonStyleOverride === "mini" ? " is-on" : ""}`} onClick={() => void setSalonStyleOverride("mini")} disabled={!salonId}>
                مینی‌اپ
              </button>
              <button type="button" className={`mini-chip${salonStyleOverride === "web" ? " is-on" : ""}`} onClick={() => void setSalonStyleOverride("web")} disabled={!salonId}>
                وب قدیمی
              </button>
              <button type="button" className={`mini-chip${salonStyleOverride === "" ? " is-on" : ""}`} onClick={() => void setSalonStyleOverride("")} disabled={!salonId}>
                پیش‌فرض سراسری
              </button>
            </div>
            <div className="mini-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="mini-btn ghost tiny"
                onClick={() => {
                  requestClassic();
                  navigate("/dashboard");
                }}
              >
                <Icon name="link" size={15} />
                نمایش پنل وب (در همین تب)
              </button>
              <button type="button" className="mini-btn tiny" onClick={() => navigate("/admin")}>
                <Icon name="sparkle" size={15} />
                پنل سوپرادمین
              </button>
            </div>
          </div>
        </>
      ) : null}

      <SectionTitle title="دسترسی سریع" />
      <div className="mini-list">
        <button type="button" className="mini-item" onClick={() => navigate("/dash/appointments")}>
          <span className="mini-item-main">
            <span className="mini-item-title">نوبت‌ها</span>
          </span>
          <Icon name="calendar" size={17} />
        </button>
        <button type="button" className="mini-item" onClick={() => navigate("/dash/wallet")}>
          <span className="mini-item-main">
            <span className="mini-item-title">کیف پول</span>
          </span>
          <Icon name="wallet" size={17} />
        </button>
        <button type="button" className="mini-item" onClick={() => navigate("/dash/notifications")}>
          <span className="mini-item-main">
            <span className="mini-item-title">اطلاعیه‌ها</span>
          </span>
          <Icon name="bell" size={17} />
        </button>
        <button type="button" className="mini-item" onClick={() => void signOut()}>
          <span className="mini-item-main">
            <span className="mini-item-title">خروج از حساب</span>
          </span>
          <Icon name="logout" size={17} />
        </button>
      </div>

      <Sheet open={passOpen} title="تغییر رمز عبور" onClose={() => setPassOpen(false)}>
        <Field label="رمز فعلی (اگر داشته باشید)" name="dash_cur_pass" dir="ltr" type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} />
        <Field label="رمز جدید" name="dash_new_pass" dir="ltr" type="password" value={nextPass} onChange={(e) => setNextPass(e.target.value)} placeholder="حداقل ۸ کاراکتر" />
        <div className="mini-btn-row" style={{ marginTop: 12 }}>
          <Button variant="ghost" onClick={() => setPassOpen(false)}>
            بازگشت
          </Button>
          <Button loading={passBusy} onClick={() => void savePassword()}>
            ثبت رمز
          </Button>
        </div>
      </Sheet>

      <Sheet open={sessionsOpen} title="نشست‌های فعال" onClose={() => setSessionsOpen(false)}>
        {sessionsLoading ? (
          <SkeletonList count={3} />
        ) : sessions.length === 0 ? (
          <div className="mini-note">نشستی ثبت نشده است.</div>
        ) : (
          <div className="mini-list">
            {sessions.map((s) => (
              <div key={s.id} className="mini-item">
                <span className="mini-item-main">
                  <span className="mini-item-title">{s.device ?? "دستگاه ناشناس"}</span>
                  <span className="mini-item-sub" dir="ltr">
                    {s.ip ?? "—"} · {fromNow(s.createdAt)}
                  </span>
                </span>
                {s.current ? (
                  <span className="mini-badge is-confirmed">همین دستگاه</span>
                ) : (
                  <button type="button" className="mini-btn ghost tiny" onClick={() => void revoke(s.id)}>
                    بستن
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}
