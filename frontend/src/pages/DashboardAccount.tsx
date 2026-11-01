/** حساب من — معادل src/app/dashboard/account/page.tsx */
import { useEffect, useState } from "react";
import { UserRound, Globe } from "lucide-react";
import { useAuth } from "@/auth";
import DashboardShell from "@/components/DashboardShell";
import AccountPanel from "@/components/AccountPanel";
import { PanelCard } from "@/components/ui/Stats";

type SalonInfo = {
  id: string;
  customDomain?: string | null;
  domainStatus?: string | null;
  plan?: string;
};

/** باکس دامنهٔ اختصاصی — مخصوص مالک سالن / ادمین (پلن سازمانی) */
function SalonDomainBox() {
  const [salon, setSalon] = useState<SalonInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pages/dashboard-salon")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.success && d.data?.mode === "salon") {
          const s = d.data.salon;
          setSalon({ id: s.id, customDomain: s.customDomain ?? "", domainStatus: s.domainStatus ?? "NONE", plan: s.plan });
          setValue(s.customDomain ?? "");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!salon) return;
    setBusy(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch(`/api/dashboard/salons/${salon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customDomain: value.trim() || null }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || "خطا در ذخیره دامنه");
      setSalon((s) => (s ? { ...s, customDomain: value.trim() || null } : s));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ذخیره دامنه");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    salon?.domainStatus === "VERIFIED" ? "تأییدشده" : salon?.domainStatus === "PENDING" ? "در انتظار تأیید" : "تنظیم نشده";
  const statusCls =
    salon?.domainStatus === "VERIFIED"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
      : salon?.domainStatus === "PENDING"
        ? "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";

  return (
    <PanelCard
      title="دامنه اختصاصی"
      subtitle="اتصال دامنهٔ شخصی به صفحهٔ سالن (پلن سازمانی)"
      icon={<Globe className="h-5 w-5" />}
    >
      <div className="space-y-3">
        <p className="text-[11px] leading-5 text-neutral-400">
          دامنهٔ سفارشی خود (مثلاً salon.com) را وارد کنید تا صفحهٔ سالن به‌جای آدرس پیش‌فرض با دامنهٔ خودتان در دسترس باشد.
          باید رکورد DNS دامنه به این سرویس اشاره کند.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-neutral-500 dark:text-neutral-400">دامنه</label>
            <input
              dir="ltr"
              placeholder="salon.com"
              disabled={loading || busy}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-11 w-full rounded-xl border border-neutral-300 bg-white px-3.5 text-sm outline-none transition focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <button
            onClick={save}
            disabled={busy || loading}
            className="flex h-11 items-center rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-5 text-sm font-bold text-white shadow-md shadow-pink-500/25 transition hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "در حال ذخیره..." : "ذخیره"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-500 dark:text-neutral-400">وضعیت:</span>
          <span className={`rounded-full px-2.5 py-0.5 font-bold ${statusCls}`}>{statusLabel}</span>
          {salon?.customDomain ? (
            <span className="text-neutral-500 dark:text-neutral-400" dir="ltr">{salon.customDomain}</span>
          ) : null}
        </div>

        {saved && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            دامنه ذخیره شد ✅
          </p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>
        )}
      </div>
    </PanelCard>
  );
}

export default function DashboardAccount() {
  const { me } = useAuth();
  if (!me) return null;

  const isSalonRole = me.role === "SALON_OWNER" || me.role === "ADMIN";

  return (
    <DashboardShell role={me.role} title="حساب من">
      <div className="mx-auto max-w-5xl space-y-5">
        <PanelCard
          title="پروفایل و تنظیمات حساب"
          subtitle="نوبت‌ها، تاریخچه مراجعات، علاقه‌مندی‌ها، نظرات و امنیت حساب شما در یک‌جا."
          icon={<UserRound className="h-5 w-5" />}
          bodyClassName="p-4 sm:p-5"
        >
          <AccountPanel
            initialMe={{
              id: me.id,
              phone: me.phone,
              name: me.name,
              email: me.email,
              avatarUrl: me.avatarUrl ?? null,
              role: me.role,
            }}
          />
        </PanelCard>

        {isSalonRole && <SalonDomainBox />}
      </div>
    </DashboardShell>
  );
}
