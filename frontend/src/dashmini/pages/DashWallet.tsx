/**
 * کیف پول — نسخهٔ مینی‌استایل از /dashboard/wallet
 *
 * داده از همان endpoint های وب:
 *   GET  /api/wallet?page&limit   موجودی + خلاصه + تراکنش‌ها (totalPages از سرور)
 *   POST /api/wallet              درخواست تسویه (amount, method, bankInfo)
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Field, Icon, Row, SectionTitle, SkeletonList } from "@/mini/components/ui";
import { compactToman, faDigits, toman } from "@/mini/lib/format";
import { dapi, qs } from "../lib/api";
import { Pager, StatGrid } from "../lib/parts";
import { useDash } from "../lib/store";

type Tx = { id: string; kind: string; reason: string; amount: number; balanceAfter: number; description?: string | null; createdAt: string };
type WalletRes = {
  success: boolean;
  error?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  wallet?: {
    id?: string;
    balance?: number;
    currency?: string;
    transactionsTotal?: number;
    totalPages?: number;
    summary?: { credit?: number; debit?: number };
    transactions?: Tx[];
  };
};

const REASON_LABEL: Record<string, string> = {
  PACKAGE_PURCHASE: "خرید پکیج",
  COMMISSION_EARNING: "کمیسیون",
  COMMISSION_PAYOUT: "تسویه کمیسیون",
  PAYOUT: "تسویه",
  REFUND: "بازگشت وجه",
  ADMIN_ADJUSTMENT: "اصلاح توسط ادمین",
};

const KIND_LABEL: Record<string, string> = { CREDIT: "واریز", DEBIT: "برداشت" };

export default function DashWallet() {
  const navigate = useNavigate();
  const { toast } = useDash();
  const [balance, setBalance] = useState(0);
  const [creditSum, setCreditSum] = useState(0);
  const [items, setItems] = useState<Tx[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [amount, setAmount] = useState("");
  const [bankInfo, setBankInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<WalletRes>(`/api/wallet${qs({ page, limit: 25 })}`);
    if (res.ok && res.data?.wallet) {
      const w = res.data.wallet;
      setBalance(Number(w.balance ?? 0));
      setCreditSum(Number(w.summary?.credit ?? 0));
      setItems(w.transactions ?? []);
      setTotal(Number(res.data.total ?? w.transactionsTotal ?? 0));
      // شمارندۀ صفحه را سرور می‌دهد؛ محاسبۀ محلی با سقف بک‌اند می‌جنگد
      setTotalPages(Math.max(1, Number(res.data.totalPages ?? w.totalPages ?? 1)));
    } else {
      setErr(res.data?.error || "کیف پول درنیامد.");
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const digits = amount.replace(/[^\d]/g, "");
  const value = digits ? Number(digits) : 0;
  const bank = bankInfo.trim();

  async function requestPayout() {
    if (value <= 0 || value > balance || bank.length < 5) return;
    setBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>("/api/wallet", {
      method: "POST",
      body: JSON.stringify({ amount: value, method: "BANK", bankInfo: bank }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "درخواست تسویه ثبت نشد.");
      notifyErr();
      return;
    }
    setErr("");
    toast("درخواست تسویه ثبت شد و در صف تأیید قرار گرفت.", "ok");
    setAmount("");
    setBankInfo("");
    void load();
  }

  function notifyErr() {
    toast("درخواست تسویه ناموفق", "error");
  }

  const payoutHint =
    value <= 0
      ? "مبلغ را وارد کنید."
      : value > balance
        ? `حداکثر ${toman(balance)} قابل تسویه است.`
        : bank.length < 5
          ? "شماره شبا یا کارت را کامل بنویسید."
          : "";

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="کیف پول" hint="موجودی و تراکنش‌های شما" />
      </div>

      {loading ? (
        <div className="dash-pane">
          <SkeletonList count={3} />
        </div>
      ) : (
        <>
          <StatGrid
            loading={false}
            cells={[
              { label: "موجودی قابل تسویه", value: compactToman(balance), hint: "به حساب بانکی" },
              { label: "مجموع واریزی‌ها", value: compactToman(creditSum), hint: `${faDigits(total)} تراکنش` },
            ]}
          />

          <div className="mini-card dash-pane">
            <SectionTitle title="درخواست تسویه" hint="انتقال موجودی به حساب بانکی" />
            <div style={{ marginTop: 12 }}>
              <Field
                label="مبلغ (تومان)"
                name="wAmount"
                type="text"
                inputMode="numeric"
                className="is-ltr"
                placeholder="مثلاً 500000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                hint={value > 0 ? `معادل ${toman(value)}` : undefined}
              />
            </div>
            <div style={{ marginTop: 10 }}>
              <Field
                label="شماره شبا یا کارت"
                name="wBank"
                type="text"
                className="is-ltr"
                dir="ltr"
                placeholder="IR……"
                value={bankInfo}
                onChange={(e) => setBankInfo(e.target.value)}
                hint="پس از تأیید مالی، مبلغ به همین حساب واریز می‌شود."
              />
            </div>
            {err ? (
              <div className="mini-note dash-note-bad" style={{ marginTop: 10 }}>
                {err}
              </div>
            ) : null}
            {payoutHint ? <div className="mini-option-sub" style={{ marginTop: 10 }}>{payoutHint}</div> : null}
            <div style={{ marginTop: 12 }}>
              <Button variant="primary" loading={busy} disabled={busy || value <= 0 || value > balance || bank.length < 5} onClick={() => void requestPayout()}>
                <Icon name="wallet" size={17} />
                {busy ? "در حال ثبت…" : "درخواست تسویه"}
              </Button>
            </div>
            <div className="mini-note" style={{ marginTop: 12 }}>
              درخواست شما پس از ثبت در صف تسویه قرار می‌گیرد؛ سوپرادمین آن را بررسی واریز می‌کند و نتیجه در فهرست تراکنش‌ها ثبت می‌شود.
            </div>
          </div>

          <div className="mini-card dash-pane">
            <SectionTitle title="تراکنش‌ها" hint={`${faDigits(total)} مورد`} />
            {items.length === 0 ? (
              <div style={{ marginTop: 10 }}>
                <EmptyState text="تراکنشی ثبت نشده است." hint="با خرید پکیج یا دریافت کمیسیون اینجا پر می‌شود." />
              </div>
            ) : (
              <>
                <div className="mini-list" style={{ marginTop: 12 }}>
                  {items.map((t) => {
                    const isIn = t.kind === "CREDIT";
                    return (
                      <div key={t.id} className="mini-item" style={{ alignItems: "flex-start" }}>
                        <span className="mini-item-main">
                          <span className="mini-item-title">{REASON_LABEL[t.reason] ?? t.reason}</span>
                          <span className="mini-item-sub">
                            {t.createdAt}
                            {t.description ? ` — ${t.description}` : ""}
                            {" · موجودی بعد از آن: "}
                            {compactToman(t.balanceAfter)}
                          </span>
                        </span>
                        <span className={`dash-tag${isIn ? "" : " is-debit"}`}>{KIND_LABEL[t.kind] ?? t.kind}</span>
                        <span className={`dash-tx-amt${isIn ? " is-in" : " is-out"}`} dir="ltr">
                          {isIn ? "+" : "−"} {toman(t.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} />
              </>
            )}
          </div>

          <div className="mini-card dash-pane">
            <SectionTitle title="خلاصه" />
            <div style={{ marginTop: 10 }}>
              <Row label="موجودی" value={toman(balance)} />
              <Row label="جمع واریزها" value={toman(creditSum)} />
              <Row label="تعداد تراکنش‌ها" value={faDigits(total)} />
            </div>
          </div>
        </>
      )}

      <SectionTitle title="بخش‌های مرتبط" />
      <div className="dash-tiles" style={{ marginTop: 10 }}>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/finance")}>
          <span className="dash-tile-icon">
            <Icon name="chart" size={18} />
          </span>
          <span className="dash-tile-title">مالی و گزارش</span>
          <span className="dash-tile-sub">درآمد خدمات، صندوق و فاکتورها</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/packages")}>
          <span className="dash-tile-icon">
            <Icon name="star" size={18} />
          </span>
          <span className="dash-tile-title">پکیج‌ها</span>
          <span className="dash-tile-sub">با موجودی کیف پول بخرید</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/commission")}>
          <span className="dash-tile-icon">
            <Icon name="bolt" size={18} />
          </span>
          <span className="dash-tile-title">کمیسیون</span>
          <span className="dash-tile-sub">سهم شما از فروش پکیج‌ها</span>
        </button>
      </div>
    </div>
  );
}
