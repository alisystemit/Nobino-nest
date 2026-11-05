/**
 * مالی و گزارش — نسخهٔ مینی‌استایل از تب‌های «گزارش / صندوق / فاکتور» سالن‌منیجر.
 *
 * داده از همان endpoint های پنل وب:
 *  • GET  {base}/report      آمار کلی + ساعات پرتقاضا + بهره‌وری کارکن
 *  • GET  {base}/revenue     سری ۳۰ روزهٔ نوبت/درآمد/لغو (نمودار)
 *  • GET  {base}/financial?from&to   گزارش مالی بازه‌ای و پرفروش‌ترین خدمات
 *  • GET/POST {base}/cash    صندوق روز + ثبت روزانه
 *  • GET/POST {base}/invoices، POST {base}/invoices/:id/resend
 *  • POST /api/ai/analyze    تحلیل هوش مصنوعی از همین آمار
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Area, Button, EmptyState, Field, Icon, Row, SectionTitle, Sheet, SkeletonList, Tabs } from "@/mini/components/ui";
import { compactToman, faDigits, timeLabel, toman, ymd } from "@/mini/lib/format";
import { formatJalali } from "@/lib/time/jalali";
import { dapi, qs } from "../lib/api";
import { Pager, SalonSwitcher, StatGrid } from "../lib/parts";
import { useDash } from "../lib/store";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";

type Pane = "report" | "financial" | "cash" | "invoices";

type PeakHour = { hour: number; count: number };
type StaffPerf = { id: string; name: string; completed: number; total: number };
type ReportData = {
  total: number;
  completed: number;
  cancelled: number;
  cancelRate: number;
  distinctCustomers: number;
  repeatCustomers: number;
  returnRate: number;
  newCustomersToday: number;
  peakHours: PeakHour[];
  staffPerformance: StaffPerf[];
};
type FinancialData = {
  from: string;
  to: string;
  totalAppointments: number;
  completed: number;
  cancelled: number;
  requested: number;
  revenue: number;
  potentialRevenue: number;
  paidSubscriptions: number;
  topServices: { id: string; name: string; count: number }[];
};
type Series = { labels: string[]; appointments: number[]; revenue: number[]; cancelled: number[] };
type CashEntry = {
  id: string;
  branch?: { name: string } | null;
  cashAmount: number;
  cardAmount: number;
  onlineAmount: number;
  expenseAmount: number;
  note?: string | null;
  createdAt: string;
};
type CashTotals = { cash: number; card: number; online: number; expense: number; net: number };
type Invoice = {
  id: string;
  number: string;
  issuedAt: string;
  period: string;
  amount: number;
  status: string;
  kind?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  description?: string | null;
  payLink?: string | null;
};

const INVOICE_STATUS: Record<string, string> = {
  PENDING: "در انتظار پرداخت",
  PAID: "پرداخت شده",
  FAILED: "ناموفق",
  REFUNDED: "بازگشت داده شده",
  CANCELLED: "لغو شده",
};

/* ── پن: گزارش کلی ───────────────────────────────────────────────── */

function ReportPane({ base, salonId, notify }: { base: string; salonId: string; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [chartOpen, setChartOpen] = useState(true);
  const [ai, setAi] = useState("");
  const [aiFromModel, setAiFromModel] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await dapi<{ success: boolean; report?: ReportData; error?: string }>(`${base}/report`);
      if (!alive) return;
      if (res.ok && res.data.report) setReport(res.data.report);
      else setErr(res.data?.error || "گزارش درنیامد.");
    })();
    void (async () => {
      const res = await dapi<{ success: boolean; labels?: string[]; appointments?: number[]; revenue?: number[]; cancelled?: number[] }>(`${base}/revenue`);
      if (!alive || !res.ok) return;
      setSeries({
        labels: res.data?.labels ?? [],
        appointments: res.data?.appointments ?? [],
        revenue: res.data?.revenue ?? [],
        cancelled: res.data?.cancelled ?? [],
      });
    })();
    return () => {
      alive = false;
    };
  }, [base]);

  async function analyze() {
    setAiBusy(true);
    setErr("");
    const res = await dapi<{ success: boolean; summary?: string; usedAI?: boolean; error?: string }>("/api/ai/analyze", {
      method: "POST",
      body: JSON.stringify({ salonId }),
    });
    setAiBusy(false);
    const text = res.data?.summary ?? res.data?.error ?? "تحلیل ممکن نشد.";
    setAi(text);
    setAiFromModel(Boolean(res.data?.usedAI));
    if (!res.ok) notify("تحلیل ناموفق", "error");
  }

  const cells = useMemo(() => {
    if (!report) return [];
    return [
      { label: "کل نوبت‌ها", value: faDigits(report.total), hint: "همهٔ سابقه" },
      { label: "انجام‌شده", value: faDigits(report.completed), hint: `${faDigits(report.cancelled)} لغو` },
      { label: "نرخ لغو", value: `${faDigits(report.cancelRate)}٪`, hint: "هرچه کمتر، بهتر" },
      { label: "مشتریان متمایز", value: faDigits(report.distinctCustomers), hint: `${faDigits(report.repeatCustomers)} مراجع مجدد` },
      { label: "نرخ بازگشت", value: `${faDigits(report.returnRate)}٪`, hint: "بیش از یک نوبت" },
      { label: "مشتری جدید امروز", value: faDigits(report.newCustomersToday), hint: "امروز ثبت‌شده" },
    ];
  }, [report]);

  if (!report) {
    return (
      <div className="dash-pane">
        <SkeletonList count={3} />
      </div>
    );
  }

  return (
    <>
      {err ? (
        <div className="mini-note dash-note-bad dash-pane">{err}</div>
      ) : null}
      <StatGrid loading={false} cells={cells} />

      <div className="mini-card dash-pane">
        <SectionTitle title="تحلیل هوش مصنوعی" hint="از همین آمار" />
        <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
          خلاصهٔ وضعیت سالن، پیشنهاد برای ساعت‌های خالی و ریسک مشتریانی که برنگشته‌اند.
        </div>
        <Button variant="primary" loading={aiBusy} disabled={aiBusy} onClick={() => void analyze()}>
          <Icon name="sparkle" size={17} />
          {aiBusy ? "در حال تحلیل…" : "تحلیل سالن"}
        </Button>
        {ai ? (
          <div className="mini-note" style={{ marginTop: 10, lineHeight: 2 }}>
            {ai}
            <div className="mini-option-sub">{aiFromModel ? "تحلیل توسط مدل زبانی" : "تحلیل خودکار بر پایهٔ آمار سالن"}</div>
          </div>
        ) : null}
      </div>

      {series ? (
        <div className="mini-card dash-pane">
          <SectionTitle
            title="نمودار ۳۰ روز"
            hint={`${compactToman(series.revenue.reduce((s, v) => s + v, 0))} درآمد`}
            action={
              <button type="button" className="mini-btn ghost tiny" onClick={() => setChartOpen((v) => !v)} aria-expanded={chartOpen}>
                {chartOpen ? "پنهان" : "نمایش"}
              </button>
            }
          />
          {chartOpen ? <RevenueSpark series={series} /> : null}
        </div>
      ) : null}

      {report.peakHours.length ? (
        <div className="mini-card dash-pane">
          <SectionTitle title="ساعات پرتقاضا" />
          <div className="mini-chips" style={{ marginTop: 10 }}>
            {report.peakHours.map((p) => (
              <span key={p.hour} className="dash-tag">
                {faDigits(p.hour)}:۰۰ — {faDigits(p.count)} نوبت
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mini-card dash-pane">
        <SectionTitle title="بهره‌وری کارکنان" hint={`${faDigits(report.staffPerformance.length)} نفر`} />
        {report.staffPerformance.length === 0 ? (
          <EmptyState text="کارمندی ثبت نشده است." hint="از بخش «کارکنان» می‌توانید اضافه کنید." />
        ) : (
          <div style={{ marginTop: 10 }}>
            {report.staffPerformance.map((s) => {
              const rate = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
              return (
                <div key={s.id} style={{ marginBottom: 10 }}>
                  <div className="dash-wk-head">
                    <span>{s.name}</span>
                    <i>
                      {faDigits(s.completed)} انجام‌شده از {faDigits(s.total)} · {faDigits(rate)}٪
                    </i>
                  </div>
                  <div className="dash-meter-bar">
                    <i style={{ width: `${rate}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/** نمودار SVG بی‌وابستگی؛ همرنگِ واژگان مینی */
function RevenueSpark({ series }: { series: Series }) {
  const n = series.labels.length;
  const maxRev = Math.max(1, ...series.revenue);
  const maxApp = Math.max(1, ...series.appointments);
  const w = 320;
  const h = 96;
  const px = (i: number) => (i * w) / Math.max(1, n - 1);
  const revPath = series.revenue.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)} ${(h - (v / maxRev) * (h - 8)).toFixed(1)}`).join(" ");
  const appPath = series.appointments.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)} ${(h - (v / maxApp) * (h - 8)).toFixed(1)}`).join(" ");

  const last7 = series.revenue.slice(-7).reduce((s, v) => s + v, 0);
  const prev7 = series.revenue.slice(-14, -7).reduce((s, v) => s + v, 0);
  const growth = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null;
  const bestIdx = series.revenue.indexOf(maxRev);
  const totalCancel = series.cancelled.reduce((s, v) => s + v, 0);
  const totalAppt = series.appointments.reduce((s, v) => s + v, 0);

  return (
    <div style={{ marginTop: 10 }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 96, display: "block" }} role="img" aria-label="نمودار درآمد و نوبت ۳۰ روز اخیر">
        <path d={appPath} fill="none" stroke="rgba(var(--m-rgb), 0.35)" strokeWidth={2} />
        <path d={revPath} fill="none" stroke="rgb(var(--m-rgb))" strokeWidth={2.5} />
      </svg>
      <div className="mini-chips" style={{ marginTop: 10 }}>
        <span className="dash-tag">درآمد ۷ روز: {compactToman(last7)}</span>
        {growth !== null ? <span className={`dash-tag${growth < 0 ? " is-off" : ""}`}>رشد هفتگی {faDigits(growth)}٪</span> : null}
        {series.labels[bestIdx] ? <span className="dash-tag">پردرآمد: {formatJalali(series.labels[bestIdx])}</span> : null}
        <span className={`dash-tag${totalCancel ? " is-off" : ""}`}>
          {faDigits(totalCancel)} لغو از {faDigits(totalAppt)} نوبت
        </span>
      </div>
      <div className="mini-option-sub" style={{ marginTop: 8 }}>
        خط پررنگ درآمد انجام‌شده و خط کم‌رنگ تعداد نوبت است.
      </div>
    </div>
  );
}

/* ── پن: گزارش مالی بازه‌ای ───────────────────────────────────────── */

function FinancialPane({ base, tz, notify }: { base: string; tz: string; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [from, setFrom] = useState(() => ymd(new Date(Date.now() - 30 * 864e5), tz));
  const [to, setTo] = useState(() => ymd(new Date(), tz));
  const [data, setData] = useState<FinancialData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!from || !to) return;
    if (to < from) {
      setErr("«تا تاریخ» باید بعد از «از تاریخ» باشد.");
      return;
    }
    setErr("");
    setBusy(true);
    const res = await dapi<{ success: boolean; report?: FinancialData; error?: string }>(`${base}/financial${qs({ from, to })}`);
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "گزارش مالی درنیامد.");
      notify("گزارش ناموفق", "error");
      return;
    }
    setData(res.data?.report ?? null);
  }, [base, from, to, notify]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  return (
    <div className="mini-card dash-pane">
      <SectionTitle title="گزارش مالی بازه‌ای" hint={data ? `${formatJalali(data.from)} تا ${formatJalali(data.to)}` : undefined} />
      <div className="dash-two" style={{ marginTop: 12 }}>
        <div className="mini-field">
          <label>از تاریخ</label>
          <JalaliDatePicker value={from} onChange={setFrom} timeZone={tz} className="mini-input" />
        </div>
        <div className="mini-field">
          <label>تا تاریخ</label>
          <JalaliDatePicker value={to} onChange={setTo} timeZone={tz} className="mini-input" />
        </div>
      </div>
      {err ? <div className="mini-note dash-note-bad" style={{ marginTop: 10 }}>{err}</div> : null}
      <Button variant="primary" loading={busy} disabled={busy} onClick={() => void load()}>
        <Icon name="chart" size={17} />
        {busy ? "در حال محاسبه…" : "محاسبهٔ بازه"}
      </Button>

      {data ? (
        <>
          <div style={{ marginTop: 14 }}>
            <Row label="درآمد خدمات انجام‌شده" value={toman(data.revenue)} />
            <Row label="ارزش نوبت‌های در انتظار" value={toman(data.potentialRevenue)} />
            <Row label="نوبت‌ها" value={`${faDigits(data.totalAppointments)} · ${faDigits(data.completed)} انجام · ${faDigits(data.requested)} در انتظار · ${faDigits(data.cancelled)} لغو`} />
            <Row label="پرداخت اشتراک پلتفرم" value={toman(data.paidSubscriptions)} />
          </div>
          <SectionTitle title="پرفروش‌ترین خدمات" hint="در همین بازه" />
          {data.topServices.length === 0 ? (
            <EmptyState text="در این بازه خدمت انجام‌شده‌ای ثبت نشده." />
          ) : (
            <div className="mini-list" style={{ marginTop: 10 }}>
              {data.topServices.map((s) => (
                <div key={s.id} className="mini-item">
                  <span className="mini-item-main">
                    <span className="mini-item-title">{s.name || "خدمت حذف‌شده"}</span>
                    <span className="mini-item-sub">{faDigits(s.count)} نوبت</span>
                  </span>
                  <span className="dash-tag">{faDigits(s.count)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

/* ── پن: صندوق ───────────────────────────────────────────────────── */

function CashPane({ base, tz, branches, notify }: { base: string; tz: string; branches: { id: string; name: string }[]; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [totals, setTotals] = useState<CashTotals | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [branchId, setBranchId] = useState("");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [online, setOnline] = useState("");
  const [expense, setExpense] = useState("");
  const [note, setNote] = useState("");

  const num = (v: string) => {
    const n = Math.round(Number(v.replace(/[^\d]/g, "")));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<{ success: boolean; entries?: CashEntry[]; total?: number; totalPages?: number; todayTotals?: CashTotals }>(
      `${base}/cash${qs({ page, limit: 25 })}`
    );
    if (res.ok) {
      setEntries(res.data?.entries ?? []);
      setTotal(Number(res.data?.total ?? 0));
      setTotalPages(Math.max(1, Number(res.data?.totalPages ?? 1)));
      setTotals(res.data?.todayTotals ?? null);
    }
    setLoading(false);
  }, [base, page]);

  useEffect(() => {
    setPage(1);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const preview = num(cash) + num(card) + num(online) - num(expense);

  async function submit() {
    if (num(cash) + num(card) + num(online) + num(expense) === 0) {
      setErr("حداقل یک مبلغ را وارد کنید.");
      return;
    }
    setErr("");
    setBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/cash`, {
      method: "POST",
      body: JSON.stringify({
        branchId: branchId || undefined,
        cashAmount: num(cash),
        cardAmount: num(card),
        onlineAmount: num(online),
        expenseAmount: num(expense),
        note: note.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "ثبت صندوق ممکن نشد.");
      notify("ثبت نشد", "error");
      return;
    }
    notify("ثبت صندوق انجام شد", "ok");
    setCash("");
    setCard("");
    setOnline("");
    setExpense("");
    setNote("");
    void load();
  }

  return (
    <>
      <div className="mini-card dash-pane">
        <SectionTitle title="صندوق امروز" hint={totals ? formatJalali(ymd(new Date(), tz)) : undefined} />
        {totals ? (
          <>
            <div style={{ marginTop: 12 }}>
              <StatGrid
                loading={false}
                cells={[
                  { label: "نقدی", value: compactToman(totals.cash), hint: "کش" },
                  { label: "کارت‌خوان", value: compactToman(totals.card), hint: "دستگاه" },
                  { label: "آنلاین", value: compactToman(totals.online), hint: "بیعانه و فاکتور" },
                  { label: "هزینه", value: compactToman(totals.expense), hint: "مخارج روز" },
                ]}
              />
            </div>
            <div style={{ marginTop: 12 }}>
              <Row label="مانده خالص امروز" value={toman(totals.net)} />
            </div>
          </>
        ) : (
          <SkeletonList count={2} />
        )}
      </div>

      <div className="mini-card dash-pane">
        <SectionTitle title="ثبت صندوق روز" />
        <div className="dash-two" style={{ marginTop: 12 }}>
          <Field label="نقدی (تومان)" name="cCash" type="text" inputMode="numeric" className="is-ltr" placeholder="0" value={cash} onChange={(e) => setCash(e.target.value)} />
          <Field label="کارت‌خوان (تومان)" name="cCard" type="text" inputMode="numeric" className="is-ltr" placeholder="0" value={card} onChange={(e) => setCard(e.target.value)} />
        </div>
        <div className="dash-two" style={{ marginTop: 10 }}>
          <Field label="آنلاین (تومان)" name="cOnline" type="text" inputMode="numeric" className="is-ltr" placeholder="0" value={online} onChange={(e) => setOnline(e.target.value)} />
          <Field label="هزینه (تومان)" name="cExpense" type="text" inputMode="numeric" className="is-ltr" placeholder="0" value={expense} onChange={(e) => setExpense(e.target.value)} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Field label="یادداشت (اختیاری)" name="cNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: خرید مواد مصرفی" />
        </div>
        {branches.length ? (
          <div className="mini-field" style={{ marginTop: 10 }}>
            <label>شعبه</label>
            <select className="mini-input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">همهٔ سالن</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {err ? <div className="mini-note dash-note-bad" style={{ marginTop: 10 }}>{err}</div> : null}
        <div className="mini-note" style={{ marginTop: 10 }}>
          ماندهٔ این ثبت: {toman(preview)}
        </div>
        <Button variant="primary" loading={busy} disabled={busy} onClick={() => void submit()}>
          <Icon name="wallet" size={17} />
          {busy ? "در حال ثبت…" : "ثبت در صندوق"}
        </Button>
      </div>

      <div className="mini-card dash-pane">
        <SectionTitle title="سابقهٔ صندوق" hint={`${faDigits(total)} ردیف`} />
        {loading ? (
          <div style={{ marginTop: 12 }}>
            <SkeletonList count={3} />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState text="هنوز ثبتی برای صندوق انجام نشده است." />
        ) : (
          <>
            <div className="mini-list" style={{ marginTop: 12 }}>
              {entries.map((e) => {
                const net = e.cashAmount + e.cardAmount + e.onlineAmount - e.expenseAmount;
                return (
                  <div key={e.id} className="mini-item" style={{ alignItems: "flex-start" }}>
                    <span className="mini-item-main">
                      <span className="mini-item-title">{toman(net)}</span>
                      <span className="mini-item-sub">
                        {formatJalali(ymd(new Date(e.createdAt), tz))} · {timeLabel(e.createdAt, tz)}
                        {e.branch?.name ? ` · ${e.branch.name}` : ""}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                      <span className="mini-item-sub" dir="ltr">
                        {faDigits(e.cashAmount)} + {faDigits(e.cardAmount)} + {faDigits(e.onlineAmount)} − {faDigits(e.expenseAmount)}
                      </span>
                    </span>
                    <span className={`dash-tag${net < 0 ? " is-off" : ""}`}>{net < 0 ? "هزینه" : "ورودی"}</span>
                  </div>
                );
              })}
            </div>
            <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}

/* ── پن: فاکتور مشتری ────────────────────────────────────────────── */

function InvoicesPane({ base, tz, notify }: { base: string; tz: string; notify: (text: string, kind?: "ok" | "error") => void }) {
  const [list, setList] = useState<Invoice[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ customerName: "", customerPhone: "", description: "", amount: "" });
  const [copiedId, setCopiedId] = useState("");
  const [resendId, setResendId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await dapi<{ success: boolean; invoices?: Invoice[]; total?: number; totalPages?: number }>(`${base}/invoices${qs({ page, limit: 25 })}`);
    if (res.ok) {
      setList(res.data?.invoices ?? []);
      setTotal(Number(res.data?.total ?? 0));
      setTotalPages(Math.max(1, Number(res.data?.totalPages ?? 1)));
    }
    setLoading(false);
  }, [base, page]);

  useEffect(() => {
    setPage(1);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const setF = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const amountDigits = form.amount.replace(/[^\d]/g, "");

  async function create() {
    if (!form.customerName.trim() || !form.customerPhone.trim() || !amountDigits) {
      setErr("نام، شماره موبایل و مبلغ لازم است.");
      return;
    }
    setErr("");
    setBusy(true);
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/invoices`, {
      method: "POST",
      body: JSON.stringify({
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        description: form.description.trim() || undefined,
        amount: Number(amountDigits),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr(res.data?.error || "صدور فاکتور ممکن نشد.");
      notify("صادر نشد", "error");
      return;
    }
    notify("فاکتور صادر و پیامک پرداخت رفت", "ok");
    setForm({ customerName: "", customerPhone: "", description: "", amount: "" });
    setOpen(false);
    void load();
  }

  async function copyLink(inv: Invoice) {
    if (!inv.payLink) return;
    // همان کاری که نسخهٔ وب می‌کند: لینک پرداخت در همین برنامه باز می‌شود
    const url = `${window.location.origin}${inv.payLink}`;
    try {
      await navigator.clipboard.writeText(url);
      notify("لینک پرداخت کپی شد", "ok");
    } catch {
      notify("کپی نشد؛ دستی انتخاب کنید", "error");
    }
    setCopiedId(inv.id);
    window.setTimeout(() => setCopiedId((c) => (c === inv.id ? "" : c)), 2000);
  }

  async function resend(inv: Invoice) {
    setResendId(inv.id);
    const res = await dapi<{ success: boolean; error?: string }>(`${base}/invoices/${inv.id}/resend`, { method: "POST" });
    setResendId("");
    if (!res.ok) {
      notify(res.data?.error || "پیامک نرفت", "error");
      return;
    }
    notify("پیامک یادآوری در صف ارسال است", "ok");
  }

  return (
    <div className="mini-card dash-pane">
      <SectionTitle
        title="فاکتور و رسید"
        hint={`${faDigits(total)} مورد`}
        action={
          <button type="button" className="mini-btn tiny" onClick={() => setOpen(true)}>
            <Icon name="ticket" size={15} />
            فاکتور جدید
          </button>
        }
      />
      <div className="mini-option-sub" style={{ marginTop: 6, lineHeight: 1.9 }}>
        با صدور، لینک پرداخت یک‌بارمصرف برای مشتری پیامک می‌شود؛ پرداخت که انجام شود وضعیت فاکتور خودکار «پرداخت شده» می‌شود.
      </div>

      {loading ? (
        <div style={{ marginTop: 12 }}>
          <SkeletonList count={3} />
        </div>
      ) : list.length === 0 ? (
        <EmptyState text="فاکتوری صادر نشده است." hint="برای تسویهٔ حضوری، فاکتور خدماتی بدهید." />
      ) : (
        <>
          <div className="mini-list" style={{ marginTop: 12 }}>
            {list.map((i) => (
              <div key={i.id} className="mini-item">
                <span className="mini-item-main">
                  <span className="mini-item-title">
                    {toman(i.amount)}
                    {i.customerName ? ` · ${i.customerName}` : ""}
                  </span>
                  <span className="mini-item-sub">
                    {i.number} · {formatJalali(ymd(new Date(i.issuedAt), tz))}
                    {" · "}
                    {i.kind === "SERVICE" ? "خدماتی" : "اشتراک"}
                    {i.description ? ` · ${i.description}` : ""}
                    {i.customerPhone ? <span dir="ltr">{` · ${i.customerPhone}`}</span> : null}
                  </span>
                </span>
                <span className={`dash-tag${i.status === "PAID" ? "" : " is-off"}`}>{INVOICE_STATUS[i.status] ?? i.status}</span>
                {i.kind === "SERVICE" && i.payLink && i.status !== "PAID" ? (
                  <span className="mini-item-acts">
                    <button type="button" className="mini-icon-btn" onClick={() => void copyLink(i)} aria-label="کپی لینک پرداخت" title={copiedId === i.id ? "کپی شد" : "کپی لینک پرداخت"}>
                      <Icon name="link" size={16} />
                    </button>
                    <button type="button" className="mini-icon-btn" disabled={Boolean(resendId)} onClick={() => void resend(i)} aria-label="ارسال مجدد پیامک پرداخت" title="ارسال مجدد پیامک">
                      <Icon name="send" size={16} />
                    </button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <Pager page={page} totalPages={totalPages} total={total} onChange={setPage} />
        </>
      )}

      <Sheet open={open} title="صدور فاکتور خدماتی" onClose={() => setOpen(false)}>
        {err ? (
          <div className="mini-note dash-note-bad" style={{ marginBottom: 10 }}>
            {err}
          </div>
        ) : null}
        <div className="dash-form-gap">
          <Field label="نام مشتری" name="invName" value={form.customerName} onChange={(e) => setF("customerName", e.target.value)} />
          <Field
            label="موبایل مشتری"
            name="invPhone"
            className="is-ltr"
            dir="ltr"
            inputMode="tel"
            placeholder="09121234567"
            value={form.customerPhone}
            onChange={(e) => setF("customerPhone", e.target.value)}
            hint="پیامک لینک پرداخت به همین شماره می‌رود."
          />
          <Field
            label="مبلغ (تومان)"
            name="invAmount"
            className="is-ltr"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => setF("amount", e.target.value)}
            hint={amountDigits ? `معادل ${toman(Number(amountDigits))}` : undefined}
          />
          <Area label="شرح خدمات (اختیاری)" name="invDesc" rows={3} value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="مثلاً: رنگ + کراتین" />
          <Button variant="primary" loading={busy} disabled={busy} onClick={() => void create()} className="dash-grow">
            <Icon name="ticket" size={17} />
            {busy ? "در حال صدور…" : "صدور فاکتور و پیامک"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/* ── صفحه ────────────────────────────────────────────────────────── */

export default function DashFinance() {
  const navigate = useNavigate();
  const { salon, salonId, canManage, toast } = useDash();
  const [pane, setPane] = useState<Pane>("report");
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  const base = useMemo(() => (salonId ? `/api/dashboard/salons/${salonId}` : ""), [salonId]);
  const tz = salon?.timezone ?? "Asia/Tehran";

  useEffect(() => {
    if (!base) {
      setBranches([]);
      return;
    }
    let alive = true;
    void (async () => {
      const res = await dapi<{ success: boolean; branches?: { id: string; name: string }[] }>(`${base}/branches`);
      if (alive && res.ok) setBranches(res.data?.branches ?? []);
    })();
    return () => {
      alive = false;
    };
  }, [base]);

  if (!salonId || !canManage) {
    return (
      <div className="mini-fade">
        <div className="dash-toolbar">
          <SectionTitle title="مالی و گزارش" hint="نیاز به دسترسی مدیریت سالن دارد." />
          <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
            <SalonSwitcher />
          </div>
        </div>
        <EmptyState text="سالنی برای دیدن مالی انتخاب نشده است." />
      </div>
    );
  }

  return (
    <div className="mini-fade">
      <div className="dash-toolbar">
        <SectionTitle title="مالی و گزارش" hint={salon?.name ? `برای ${salon.name}` : undefined} />
        <div className="mini-actions" style={{ marginInlineStart: "auto" }}>
          <SalonSwitcher />
        </div>
      </div>

      <div className="dash-tabs" style={{ marginTop: 12 }}>
        <Tabs<Pane>
          value={pane}
          onChange={setPane}
          items={[
            { id: "report", label: "گزارش روزانه", icon: "chart" },
            { id: "financial", label: "گزارش مالی", icon: "wallet" },
            { id: "cash", label: "صندوق", icon: "bolt" },
            { id: "invoices", label: "فاکتورها", icon: "ticket" },
          ]}
        />
      </div>

      {pane === "report" ? <ReportPane base={base} salonId={salonId} notify={toast} /> : null}
      {pane === "financial" ? <FinancialPane base={base} tz={tz} notify={toast} /> : null}
      {pane === "cash" ? <CashPane base={base} tz={tz} branches={branches} notify={toast} /> : null}
      {pane === "invoices" ? <InvoicesPane base={base} tz={tz} notify={toast} /> : null}

      <SectionTitle title="بخش‌های مرتبط" />
      <div className="dash-tiles" style={{ marginTop: 10 }}>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/appointments")}>
          <span className="dash-tile-icon">
            <Icon name="calendar" size={18} />
          </span>
          <span className="dash-tile-title">نوبت‌های امروز</span>
          <span className="dash-tile-sub">درآمد قطعی و در انتظار از همین نوبت‌ها</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/management")}>
          <span className="dash-tile-icon">
            <Icon name="chart" size={18} />
          </span>
          <span className="dash-tile-title">مدیریت سالن</span>
          <span className="dash-tile-sub">تعطیلات، شعبه، کمپین و خروجی داده</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/dash/wallet")}>
          <span className="dash-tile-icon">
            <Icon name="wallet" size={18} />
          </span>
          <span className="dash-tile-title">کیف پول</span>
          <span className="dash-tile-sub">موجودی و تراکنش‌های پلتفرم</span>
        </button>
        <button type="button" className="dash-tile" onClick={() => navigate("/packages")}>
          <span className="dash-tile-icon">
            <Icon name="star" size={18} />
          </span>
          <span className="dash-tile-title">پکیج‌ها</span>
          <span className="dash-tile-sub">اشتراک، سقف پیامک و امکانات</span>
        </button>
      </div>

      <div className="dash-section-note" style={{ marginTop: 14 }}>
        ارقام «درآمد» از قیمت خدمات نوبت‌های انجام‌شده محاسبه می‌شود؛ مبلغ واقعی پرداختی مشتری در «صندوق» ثبت می‌شود و این دو می‌توانند متفاوت باشند.
      </div>
    </div>
  );
}
