"use client";

import { useEffect, useState } from "react";
import { Banknote, Landmark, Receipt, TrendingUp, Wallet } from "lucide-react";
import { formatToman, toPersianDigits } from "@/lib/utils";
import DashboardShell from "@/components/DashboardShell";
import { Badge, PanelCard, StatCard } from "@/components/ui/Stats";

type Tx = { id: string; kind: string; reason: string; amount: number; balanceAfter: number; description?: string; createdAt: string };

const kindLabels: Record<string, string> = { CREDIT: "واریز", DEBIT: "برداشت" };
const reasonLabels: Record<string, string> = {
  PACKAGE_PURCHASE: "خرید پکیج",
  COMMISSION_EARNING: "کمیسیون",
  COMMISSION_PAYOUT: "تسویه کمیسیون",
  PAYOUT: "تسویه",
  REFUND: "بازگشت وجه",
  ADMIN_ADJUSTMENT: "اصلاح توسط ادمین",
};
const reasonTone: Record<string, "success" | "info" | "warning" | "neutral" | "danger" | "brand"> = {
  PACKAGE_PURCHASE: "brand",
  COMMISSION_EARNING: "success",
  COMMISSION_PAYOUT: "info",
  PAYOUT: "info",
  REFUND: "warning",
  ADMIN_ADJUSTMENT: "neutral",
};

function faDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export default function WalletPage() {
  const [role, setRole] = useState("");
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [amount, setAmount] = useState("");
  const [bankInfo, setBankInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetch("/api/wallet")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setBalance(data.wallet.balance);
          setTransactions(data.wallet.transactions);
        }
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
    (async () => {
      try {
        const me = await (await fetch("/api/auth/me")).json();
        setRole(me.user?.role ?? "");
      } catch {}
    })();
  }, []);

  async function requestPayout() {
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), method: "BANK", bankInfo }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "خطا");
      setMsg({ ok: true, text: "درخواست تسویه ثبت شد." });
      setAmount("");
      setBankInfo("");
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا" });
    } finally {
      setSubmitting(false);
    }
  }

  const creditSum = transactions.filter((t) => t.kind === "CREDIT").reduce((a, t) => a + t.amount, 0);

  if (loading) return <DashboardShell role={role} title="کیف پول"><p className="py-10 text-center text-neutral-400">در حال بارگیری...</p></DashboardShell>;

  const input = "h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 text-sm outline-none focus:border-pink-400 focus:bg-white dark:border-neutral-700 dark:bg-neutral-800";

  return (
    <DashboardShell role={role} title="کیف پول">
      {/* آمار */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard
          label="موجودی قابل تسویه"
          value={formatToman(balance)}
          icon={<Wallet className="h-5 w-5" />}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
          sub="مبلغی که می‌توانید به حساب بانکی منتقل کنید"
        />
        <StatCard
          label="مجموع واریزی‌ها"
          value={formatToman(creditSum)}
          icon={<TrendingUp className="h-5 w-5" />}
          iconClass="bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300"
          sub={`در ${toPersianDigits(transactions.length)} تراکنش ثبت‌شده`}
        />
        <div className="col-span-2 sm:col-span-1">
        <StatCard
          label="تراکنش‌ها"
          value={toPersianDigits(transactions.length)}
          icon={<Receipt className="h-5 w-5" />}
          iconClass="bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300"
          sub="تاریخچه کامل واریز و برداشت کیف پول"
        />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* درخواست تسویه */}
        <PanelCard
          title="درخواست تسویه"
          subtitle="انتقال موجودی به حساب بانکی"
          icon={<Banknote className="h-5 w-5" />}
          className="self-start"
        >
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-neutral-500 dark:text-neutral-400">مبلغ (تومان)</span>
              <input
                type="number"
                placeholder="مثلاً ۵۰۰٬۰۰۰"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={input}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-neutral-500 dark:text-neutral-400">شماره شبا یا کارت</span>
              <input
                dir="ltr"
                placeholder="IR..." 
                value={bankInfo}
                onChange={(e) => setBankInfo(e.target.value)}
                className={`${input} text-left`}
              />
            </label>
            <div className="rounded-xl bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
              <div className="flex items-center gap-1.5 font-bold text-neutral-600 dark:text-neutral-300">
                <Landmark className="h-3.5 w-3.5" /> تسویه خودکار
              </div>
              درخواست شما پس از ثبت، در صف تسویه قرار می‌گیرد و پس از تأیید مالی به حساب اعلام‌شده واریز می‌شود.
            </div>
            <button
              onClick={requestPayout}
              disabled={submitting || !amount || Number(amount) <= 0 || Number(amount) > balance || bankInfo.trim().length < 5}
              className="h-12 w-full rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 font-black text-white shadow-lg shadow-pink-500/25 transition hover:scale-[1.01] disabled:opacity-50"
            >
              {submitting ? "در حال ثبت..." : "درخواست تسویه"}
            </button>
            {msg && (
              <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"}`}>
                {msg.text}
              </p>
            )}
          </div>
        </PanelCard>

        {/* تراکنش‌ها */}
        <PanelCard
          title="تراکنش‌ها"
          subtitle="همه واریزها و برداشت‌های کیف پول"
          icon={<Receipt className="h-5 w-5" />}
          action={<Badge tone="brand">{toPersianDigits(transactions.length)} مورد</Badge>}
          bodyClassName="p-0"
        >
          <div className="max-h-[60dvh] overflow-y-auto sm:max-h-[560px]">
            {transactions.length === 0 && (
              <p className="py-14 text-center text-sm text-neutral-400">تراکنشی ثبت نشده است.</p>
            )}
            {transactions.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 ${i > 0 ? "border-t border-neutral-100 dark:border-neutral-800" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-neutral-800 dark:text-neutral-100">{reasonLabels[t.reason] ?? t.reason}</span>
                    <Badge tone={reasonTone[t.reason] ?? "neutral"}>{kindLabels[t.kind] ?? t.kind}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {faDateTime(t.createdAt)}
                    {t.description ? ` — ${t.description}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  <div className={`text-sm font-black ${t.kind === "CREDIT" ? "text-emerald-600" : "text-red-500"}`}>
                    {t.kind === "CREDIT" ? "+" : "−"} {formatToman(t.amount)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-400">موجودی: {formatToman(t.balanceAfter)}</div>
                </div>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>
    </DashboardShell>
  );
}
