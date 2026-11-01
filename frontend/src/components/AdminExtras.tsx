"use client";

import { useCallback, useEffect, useState } from "react";
import AdminCharts from "@/components/AdminCharts";
import SystemSettings from "@/components/SystemSettings";
import SalonIcon from "@/components/icons/SalonIcon";
import { MODULES, findModule, moduleIcon, moduleLabel, normalizeFeatures, type StoredFeature } from "@/lib/plans/modules";

/* ─── تایپ‌ها ────────────────────────────────────────────────────────── */

type ApiRes<T = Record<string, unknown>> = { success: boolean; error?: string } & T;

type Discount = { id: string; code: string; percent: number; maxUses: number | null; usedCount: number; isActive: boolean };
type Salon = { id: string; name: string; slug: string; owner: { phone: string } | null; isApproved: boolean; isActive: boolean };
type SalonDetail = {
  id: string;
  name: string;
  _count: { appointments: number; staff: number; services: number; branches: number; reviews: number; orders: number };
  paidRevenue?: number;
  subscription?: { plan: string; endsAt: string } | null;
  recentAppointments?: { id: string; customerName: string; startAt: string; status: string }[];
};
type Metrics = {
  mrrLabel: string;
  totalRevenueLabel: string;
  activeSubscriptions: number;
  approvedSalons: number;
  trialSalons: number;
  churnRate: number | string;
  planBreakdown?: { plan: string; count: number }[];
};
type Review = {
  id: string;
  salon?: { name: string } | null;
  rating: number;
  customer?: { name?: string | null; phone?: string | null } | null;
  staff?: { name: string } | null;
  comment?: string | null;
};
type AuditLog = { id: string; action: string; entityType: string; actorPhone?: string | null; createdAt: string };
type Subscription = { id: string; salon?: { name: string } | null; package?: { name: string } | null; endsAt: string; period: string; status: string };
type UserRow = { id: string; name?: string | null; phone: string; email?: string | null; loyaltyPoints: number; role: string; isActive: boolean };
type Pkg = {
  id: string;
  name: string;
  plan: string;
  price: number;
  yearlyPrice: number | null;
  durationDays: number;
  features: StoredFeature[];
  featureLabels?: string[];
  isActive: boolean;
  subscriptionCount?: number;
  orderCount?: number;
  paidOrderCount?: number;
};
type PkgDraft = { id: string | null; name: string; plan: string; price: number; yearlyPrice: number | null; durationDays: number; features: StoredFeature[]; isActive: boolean };
type Ticket = {
  id: string;
  subject: string;
  user?: { name?: string | null; phone?: string | null } | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  category: string;
  status: string;
  message: string;
  adminReply?: string | null;
};
type NotifItem = {
  id: string;
  type: string;
  channel: string;
  status: string;
  attempts: number;
  recipient: string;
  lastError?: string | null;
  createdAt: string;
};
type NotifData = { summary: Record<string, number>; notifications: NotifItem[] };

type Ctx = {
  api: <T = ApiRes>(path: string, method: string, body?: unknown, okMsg?: string) => Promise<T | null>;
  setMsg: (m: { ok: boolean; text: string } | null) => void;
};

/* ─── کلاس‌های مشترک ─────────────────────────────────────────────────── */

const input =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const card = "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
const listRow = "rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
const ghostBtn =
  "rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700";
const dangerBtn = "rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/40";
const okBtn = "rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40";
const primaryBtn =
  "rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-pink-500/20 transition hover:opacity-95 disabled:opacity-50";
const darkBtn = "rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200";

const TICKET_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: "باز", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  IN_PROGRESS: { label: "در بررسی", cls: "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  CLOSED: { label: "بسته", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
};

/* ─── کدهای تخفیف ────────────────────────────────────────────────────── */

function DiscountManager({ ctx, discounts, refresh }: { ctx: Ctx; discounts: Discount[]; refresh: () => void }) {
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);

  async function create() {
    if (!code.trim()) return ctx.setMsg({ ok: false, text: "کد تخفیف را وارد کنید" });
    const r = await ctx.api("/api/admin/discounts", "POST", { code: code.trim(), percent: Number(percent) }, "کد تخفیف ساخته شد ✅");
    if (r) {
      setCode("");
      refresh();
    }
  }

  async function remove(id: string) {
    const r = await ctx.api(`/api/admin/discounts/${id}`, "DELETE", undefined, "کد تخفیف حذف شد ✅");
    if (r) refresh();
  }

  return (
    <div>
      <div className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-[1fr_120px_auto]">
        <input className={input} placeholder="کد (مثلاً NOBINO20)" dir="ltr" aria-label="کد تخفیف" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className={input} type="number" placeholder="درصد" aria-label="درصد تخفیف" value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
        <button onClick={create} className={darkBtn}>ساخت کد</button>
      </div>
      <div className="mt-4 space-y-2">
        {discounts.length === 0 && <p className="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">کد تخفیفی ساخته نشده است.</p>}
        {discounts.map((d) => (
          <div key={d.id} className={`${listRow} flex items-center justify-between`}>
            <div>
              <div className="font-bold text-neutral-800 dark:text-neutral-100" dir="ltr">
                {d.code}
                {!d.isActive && <span className="mr-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">غیرفعال</span>}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {d.percent}٪ — استفاده‌شده {d.usedCount}/{d.maxUses ?? "∞"}
              </div>
            </div>
            <button onClick={() => remove(d.id)} className={dangerBtn}>حذف</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── مدیریت سالن‌ها ─────────────────────────────────────────────────── */

function SalonManagerList({ ctx, salons, refresh }: { ctx: Ctx; salons: Salon[]; refresh: () => void }) {
  const [detail, setDetail] = useState<SalonDetail | null>(null);
  const [loading, setLoading] = useState(false);

  async function open(salonId: string) {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/salons/${salonId}`);
      const d = await r.json();
      if (d.success) setDetail(d.salon as SalonDetail);
      else ctx.setMsg({ ok: false, text: d.error || "خطا" });
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در دریافت جزئیات" });
    } finally {
      setLoading(false);
    }
  }

  async function toggle(salon: Salon, field: "isApproved" | "isActive") {
    const r = await ctx.api(
      `/api/admin/salons/${salon.id}/status`,
      "PATCH",
      { [field]: !salon[field] },
      field === "isApproved" ? (salon.isApproved ? "تأیید سالن لغو شد" : "سالن تأیید شد ✅") : salon.isActive ? "سالن معلق شد" : "سالن فعال شد ✅"
    );
    if (r) refresh();
  }

  return (
    <div className="space-y-2">
      {loading && <p className="py-4 text-center text-sm text-neutral-400">در حال دریافت جزئیات...</p>}
      {detail && (
        <div className="rounded-2xl border border-pink-200 bg-pink-50/60 p-4 dark:border-pink-800 dark:bg-pink-950/20">
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-neutral-900 dark:text-neutral-100">{detail.name}</h4>
            <button onClick={() => setDetail(null)} className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-neutral-600 shadow-sm dark:bg-neutral-800 dark:text-neutral-300">بستن ✕</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["نوبت‌ها", String(detail._count.appointments)],
              ["کارکنان", String(detail._count.staff)],
              ["خدمات", String(detail._count.services)],
              ["شعبه‌ها", String(detail._count.branches)],
              ["نظرات", String(detail._count.reviews)],
              ["سفارش‌ها", String(detail._count.orders)],
              ["درآمد پرداخت‌شده", (detail.paidRevenue ?? 0).toLocaleString("fa-IR")],
              ["وضعیت", detail.subscription ? detail.subscription.plan : "بدون اشتراک"],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-white px-3 py-2 text-center shadow-sm dark:bg-neutral-800">
                <div className="text-sm font-black text-neutral-900 dark:text-neutral-100">{v}</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{l}</div>
              </div>
            ))}
          </div>
          {detail.subscription && (
            <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm dark:bg-neutral-800 dark:text-neutral-300">
              اشتراک: <b>{detail.subscription.plan}</b> — تا {new Date(detail.subscription.endsAt).toLocaleDateString("fa-IR")}
            </div>
          )}
          <div className="mt-3 space-y-1">
            <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">آخرین نوبت‌ها</div>
            {(detail.recentAppointments ?? []).slice(0, 5).map((a) => (
              <div key={a.id} className="flex justify-between rounded-lg bg-white px-3 py-1.5 text-xs shadow-sm dark:bg-neutral-800">
                <span className="text-neutral-800 dark:text-neutral-100">{a.customerName}</span>
                <span className="text-neutral-500 dark:text-neutral-400">{new Date(a.startAt).toLocaleString("fa-IR")} — {a.status}</span>
              </div>
            ))}
            {(detail.recentAppointments ?? []).length === 0 && <p className="text-xs text-neutral-400">نوبتی ثبت نشده است.</p>}
          </div>
        </div>
      )}
      {salons.length === 0 && <p className="py-8 text-center text-neutral-400 dark:text-neutral-500">سالنی یافت نشد.</p>}
      {salons.map((s) => (
        <div key={s.id} className={`${listRow} flex flex-wrap items-center justify-between gap-2`}>
          <button onClick={() => open(s.id)} className="text-right">
            <div className="font-bold text-neutral-800 dark:text-neutral-100">
              {s.name} <span className="text-xs font-normal text-neutral-400" dir="ltr">/{s.slug}</span>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400" dir="ltr">{s.owner?.phone ?? "—"}</div>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.isApproved ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
              {s.isApproved ? "تأیید‌شده" : "در انتظار"}
            </span>
            <button onClick={() => open(s.id)} className={ghostBtn}>جزئیات</button>
            <button onClick={() => toggle(s, "isApproved")} className={ghostBtn}>{s.isApproved ? "لغو تأیید" : "تأیید"}</button>
            <button onClick={() => toggle(s, "isActive")} className={s.isActive ? dangerBtn : okBtn}>{s.isActive ? "تعلیق" : "فعال‌سازی"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── سوئیچ نمایش کدهای ارسالی (پیامک/ایمیل) ─────────────────────────── */

const SHOW_SENT_CODES_KEY = "sms.show_sent_codes";

/**
 * با روشن‌کردن این سوئیچ، کد تأییدی که برای کاربر ارسال می‌شود دوباره در
 * صفحهٔ ورود نمایش داده می‌شود (مثل حالت توسعه) — برای تست روی سرور واقعی.
 * در محیط توسعه همیشه فعال است و نیازی به روشن‌کردن ندارد.
 */
function SentCodesToggle({ ctx }: { ctx: Ctx }) {
  const [on, setOn] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ctx
      .api<ApiRes<{ settings?: { key: string; value?: string | null }[] }>>("/api/admin/settings", "GET")
      .then((d) => {
        if (cancelled || !d) return;
        const row = d.settings?.find((s) => s.key === SHOW_SENT_CODES_KEY);
        setOn((row?.value ?? "false").trim().toLowerCase() === "true");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  async function toggle(next: boolean) {
    setBusy(true);
    const r = await ctx.api<ApiRes>(
      "/api/admin/settings",
      "PATCH",
      { updates: [{ key: SHOW_SENT_CODES_KEY, value: next ? "true" : "false", group: "sms", type: "select" }] },
      next ? "نمایش کدهای ارسالی روشن شد" : "نمایش کدهای ارسالی خاموش شد",
    );
    if (r) setOn(next);
    setBusy(false);
  }

  return (
    <div className={`${card} mb-4 flex flex-wrap items-center justify-between gap-4`}>
      <div className="min-w-0">
        <h3 className="text-sm font-black text-neutral-900 dark:text-neutral-100">نمایش کدهای ارسالی در صفحه ورود</h3>
        <p className="mt-1 text-xs leading-6 text-neutral-500 dark:text-neutral-400">
          با روشن‌کردن، کد پیامک/ایمیل بلافاصله زیر فرم ورود نمایش داده می‌شود تا بدون دسترسی به سرویس پیامک بتوانید ورود را تست کنید.
          <span className="font-bold text-amber-600 dark:text-amber-400"> در سرویس واقعی خاموشش کنید.</span>
        </p>
        {!loaded && <p className="mt-1 text-[11px] text-neutral-400">در حال خواندن وضعیت…</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy || !loaded}
        onClick={() => toggle(!on)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? "right-1" : "right-7"}`} />
        <span className="sr-only">{on ? "روشن" : "خاموش"}</span>
      </button>
    </div>
  );
}

/* ─── تست پیامک ──────────────────────────────────────────────────────── */

function SmsTest({ ctx }: { ctx: Ctx }) {
  const [provider, setProvider] = useState("kavenegar");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function test() {
    if (phone.length < 11) return ctx.setMsg({ ok: false, text: "شماره موبایل معتبر وارد کنید" });
    setBusy(true);
    const r = await ctx.api<ApiRes<{ message?: string }>>("/api/admin/sms/test", "POST", { provider, phone });
    if (r) ctx.setMsg({ ok: true, text: r.message ?? "پیامک تست ارسال شد ✅" });
    setBusy(false);
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-[1fr_1fr_auto]">
      <input className={input} placeholder="شماره موبایل برای تست" dir="ltr" aria-label="شماره تست" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
      <select className={input} value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="ارائه‌دهنده پیامک">
        {["kavenegar", "smsdotir", "farazsms", "ghasedak", "melipayamak", "iransms", "payamresan", "nakalaya", "mobilesms", "arpano"].map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <button onClick={test} disabled={busy} className={primaryBtn}>{busy ? "در حال ارسال..." : "ارسال تست"}</button>
    </div>
  );
}

/* ─── متریک‌های SaaS ─────────────────────────────────────────────────── */

function MetricsManager({ ctx }: { ctx: Ctx }) {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/saas-metrics")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setM(d.metrics as Metrics);
      })
      .catch(() => ctx.setMsg({ ok: false, text: "خطا در دریافت متریک‌ها" }));
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  if (!m) return <p className="py-6 text-center text-neutral-400 dark:text-neutral-500">در حال محاسبه...</p>;
  const cards = [
    { label: "درآمد ماهانه تکرارشونده (MRR)", value: m.mrrLabel, icon: "📈", grad: "from-emerald-500 to-teal-500" },
    { label: "مجموع درآمد", value: m.totalRevenueLabel, icon: "💵", grad: "from-pink-500 to-rose-500" },
    { label: "اشتراک فعال", value: String(m.activeSubscriptions), icon: "✅", grad: "from-sky-500 to-blue-500" },
    { label: "سالن تأییدشده", value: String(m.approvedSalons), icon: "salon", grad: "from-purple-500 to-violet-500" },
    { label: "سالن‌های آزمایشی", value: String(m.trialSalons), icon: "🎁", grad: "from-amber-500 to-orange-500" },
    { label: "نرخ ریزش ۳۰ روزه", value: `${m.churnRate}٪`, icon: "📉", grad: "from-rose-500 to-red-500" },
  ];
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className={`flex items-center justify-between bg-gradient-to-l ${c.grad} px-4 py-2.5`}>
              <span className="text-xs font-bold text-white/90">{c.label}</span>
              <span className="text-lg">{c.icon === "salon" ? <SalonIcon className="h-5 w-5 text-white" /> : c.icon}</span>
            </div>
            <div className="px-4 py-3 text-xl font-black text-neutral-900 dark:text-neutral-100">{c.value}</div>
          </div>
        ))}
      </div>
      {(() => {
        const breakdown = m.planBreakdown ?? [];
        if (breakdown.length === 0) return null;
        return (
          <div className={`${card} mt-4`}>
            <h4 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">توزیع پلن سالن‌ها</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {breakdown.map((p) => (
                <span key={p.plan} className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-700 dark:bg-pink-950/40 dark:text-pink-300">
                  {p.plan}: {p.count}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── مدیریت نظرات ───────────────────────────────────────────────────── */

function ReviewManager({ ctx }: { ctx: Ctx }) {
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/reviews")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setReviews(d.reviews as Review[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(id: string) {
    const r = await ctx.api("/api/admin/reviews", "DELETE", { id }, "نظر حذف شد ✅");
    if (r) setReviews((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-2">
      {reviews.length === 0 && <p className="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">نظری ثبت نشده است.</p>}
      {reviews.map((r) => (
        <div key={r.id} className={`${listRow} flex flex-wrap items-center justify-between gap-2`}>
          <div>
            <div className="font-bold text-neutral-800 dark:text-neutral-100">
              {r.salon?.name ?? "سالن"} <span className="text-amber-500">★ {r.rating}</span>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {r.customer?.name ?? r.customer?.phone ?? "مشتری"}{r.staff ? ` — ${r.staff.name}` : ""}
            </div>
            {r.comment && <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{r.comment}</div>}
          </div>
          <button onClick={() => remove(r.id)} className={dangerBtn}>حذف نظر</button>
        </div>
      ))}
    </div>
  );
}

/* ─── لاگ فعالیت‌ها ──────────────────────────────────────────────────── */

function AuditView({ ctx }: { ctx: Ctx }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/audit")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setLogs(d.logs as AuditLog[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyFilter() {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    if (entity) params.set("entity", entity);
    const r = await fetch(`/api/admin/audit?${params}`);
    const d = await r.json();
    if (d.success) setLogs(d.logs as AuditLog[]);
    else ctx.setMsg({ ok: false, text: d.error || "خطا" });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className={`${input} sm:max-w-[220px]`} placeholder="اقدام (مثلاً approve_salon)" value={action} onChange={(e) => setAction(e.target.value)} />
        <input className={`${input} sm:max-w-[200px]`} placeholder="نوع موجودیت (Salon/User)" value={entity} onChange={(e) => setEntity(e.target.value)} />
        <button onClick={applyFilter} className={darkBtn}>فیلتر</button>
      </div>
      <div className="space-y-2">
        {logs.length === 0 && <p className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">رویدادی یافت نشد.</p>}
        {logs.map((a) => (
          <div key={a.id} className={`${listRow} flex items-center justify-between`}>
            <div>
              <div className="font-bold text-neutral-800 dark:text-neutral-100">{a.action}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">{a.entityType} — {a.actorPhone ?? "سیستم"}</div>
            </div>
            <div className="text-xs text-neutral-400 dark:text-neutral-500">{new Date(a.createdAt).toLocaleString("fa-IR")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── پخش پیامک سراسری ───────────────────────────────────────────────── */

function BroadcastView({ ctx }: { ctx: Ctx }) {
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("ALL_SALONS");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!message.trim()) return ctx.setMsg({ ok: false, text: "متن پیامک را وارد کنید" });
    setSending(true);
    const d = await ctx.api<ApiRes<{ queued?: number }>>("/api/admin/broadcast", "POST", { message: message.trim(), audience });
    if (d) {
      ctx.setMsg({ ok: true, text: `پیامک به ${d.queued ?? 0} شماره در صف قرار گرفت ✅` });
      setMessage("");
    }
    setSending(false);
  }

  return (
    <div className={`${card} max-w-2xl`}>
      <h4 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">پخش پیامک سراسری</h4>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">پیامک از طریق صف اعلان‌ها ارسال می‌شود و به‌صورت تدریجی تحویل می‌گردد.</p>
      <textarea className={`${input} mt-3 min-h-[90px]`} placeholder="متن پیامک..." aria-label="متن پیامک" value={message} onChange={(e) => setMessage(e.target.value)} />
      <select className={`${input} mt-3`} value={audience} onChange={(e) => setAudience(e.target.value)} aria-label="مخاطبان">
        <option value="ALL_SALONS">همه سالن‌ها (فعال)</option>
        <option value="SALON_OWNERS">همه مالکان سالن</option>
        <option value="ACTIVE_SUBS">مشترکین فعال</option>
      </select>
      <button onClick={send} disabled={sending || !message.trim()} className={`${primaryBtn} mt-3 w-full py-3`}>
        {sending ? "در حال ارسال..." : "ارسال پیامک سراسری"}
      </button>
    </div>
  );
}

/* ─── مدیریت اشتراک‌ها ───────────────────────────────────────────────── */

function SubscriptionManager({ ctx }: { ctx: Ctx }) {
  const [subs, setSubs] = useState<Subscription[]>([]);

  const reload = useCallback(async () => {
    const r = await fetch("/api/admin/subscriptions");
    const d = await r.json();
    if (d.success) setSubs(d.subscriptions as Subscription[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/subscriptions")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setSubs(d.subscriptions as Subscription[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function setStatus(id: string, status: string) {
    const r = await ctx.api("/api/admin/subscriptions", "PATCH", { subscriptionId: id, status }, status === "CANCELLED" ? "اشتراک لغو شد" : "وضعیت اشتراک به‌روزرسانی شد ✅");
    if (r) reload();
  }

  return (
    <div className="space-y-2">
      {subs.length === 0 && <p className="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">اشتراکی ثبت نشده است.</p>}
      {subs.map((s) => (
        <div key={s.id} className={`${listRow} flex flex-wrap items-center justify-between gap-2`}>
          <div>
            <div className="font-bold text-neutral-800 dark:text-neutral-100">
              {s.salon?.name ?? "سالن"} <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">({s.package?.name ?? "—"})</span>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{new Date(s.endsAt).toLocaleDateString("fa-IR")} — {s.period}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : s.status === "EXPIRED" ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"}`}>
              {s.status === "ACTIVE" ? "فعال" : s.status === "EXPIRED" ? "منقضی" : s.status}
            </span>
            {s.status === "ACTIVE" && (
              <button onClick={() => setStatus(s.id, "CANCELLED")} className={dangerBtn}>لغو</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── مدیریت کاربران ─────────────────────────────────────────────────── */

function UserManager({ ctx }: { ctx: Ctx }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setUsers(d.users as UserRow[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function search() {
    const r = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    if (d.success) setUsers(d.users as UserRow[]);
    else ctx.setMsg({ ok: false, text: d.error || "خطا" });
  }

  async function changeRole(id: string, role: string) {
    const r = await ctx.api("/api/admin/users", "PATCH", { userId: id, role }, "نقش کاربر تغییر کرد ✅");
    if (r) search();
  }

  async function toggleActive(u: UserRow) {
    const r = await ctx.api("/api/admin/users", "PATCH", { userId: u.id, isActive: !u.isActive }, u.isActive ? "حساب کاربر تعلیق شد" : "حساب کاربر فعال شد ✅");
    if (r) search();
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input className={input} placeholder="جستجوی موبایل/نام/ایمیل..." aria-label="جستجوی کاربر" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        <button onClick={search} className={darkBtn}>جستجو</button>
      </div>
      <div className="space-y-2">
        {users.length === 0 && <p className="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">کاربری یافت نشد.</p>}
        {users.map((u) => (
          <div key={u.id} className={`${listRow} flex flex-wrap items-center justify-between gap-2`}>
            <div>
              <div className="font-bold text-neutral-800 dark:text-neutral-100">
                {u.name ?? u.phone} <span className="text-xs font-normal text-neutral-400" dir="ltr">{u.phone}</span>
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">امتیاز: {u.loyaltyPoints} — {u.email ?? "بدون ایمیل"}</div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={u.role}
                onChange={(e) => changeRole(u.id, e.target.value)}
                aria-label={`نقش ${u.name ?? u.phone}`}
                className="rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                {["CUSTOMER", "SALON_OWNER", "AGENT", "ADMIN"].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={() => toggleActive(u)} className={u.isActive ? dangerBtn : okBtn}>{u.isActive ? "تعلیق" : "فعال"}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── مدیریت پکیج‌ها ─────────────────────────────────────────────────── */

/** برچسب فارسی پلن (PLAN_LABELS در limits.ts سمت سرور است و قابل import در کلاینت نیست) */
const PLAN_TITLES: Record<string, string> = { FREE: "رایگان", BASIC: "پایه", PRO: "حرفه‌ای", ENTERPRISE: "سازمانی" };

function PackageManager({ ctx }: { ctx: Ctx }) {
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [editing, setEditing] = useState<PkgDraft | null>(null);
  const [customText, setCustomText] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await fetch("/api/admin/packages");
    const d = await r.json();
    if (d.success) setPkgs(d.packages as Pkg[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/packages")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setPkgs(d.packages as Pkg[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return ctx.setMsg({ ok: false, text: "نام پکیج را وارد کنید" });
    const payload = { ...editing, name: editing.name.trim() };
    const r = await ctx.api("/api/admin/packages", editing.id ? "PATCH" : "POST", payload, editing.id ? "پکیج به‌روز شد ✅" : "پکیج جدید ساخته شد ✅");
    if (r) {
      setEditing(null);
      reload();
    }
  }

  /**
   * حذف پکیج. اگر اشتراک یا سفارشی به آن وصل باشد، حالت پیش‌فرض فقط غیرفعالش
   * می‌کند تا تاریخچهٔ مالی و فاکتورها سالم بمانند؛ «حذف قطعی» (force) فقط وقتی
   * ممکن است که هیچ سفارش پرداخت‌شده‌ای به آن وصل نباشد.
   */
  async function remove(p: Pkg, force = false) {
    setConfirmId(null);
    setBusyId(p.id);
    const d = await ctx.api<
      ApiRes<{ deleted?: boolean; deactivated?: boolean; subscriptions?: number; orders?: number; purgedSubscriptions?: number; purgedOrders?: number }>
    >(`/api/admin/packages?id=${encodeURIComponent(p.id)}${force ? "&force=1" : ""}`, "DELETE");
    setBusyId(null);
    if (!d) return;
    if (d.deleted && (d.purgedOrders ?? 0) + (d.purgedSubscriptions ?? 0) > 0) {
      ctx.setMsg({
        ok: true,
        text:
          `پکیج «${p.name}» و ${(d.purgedSubscriptions ?? 0).toLocaleString("fa-IR")} اشتراک و ` +
          `${(d.purgedOrders ?? 0).toLocaleString("fa-IR")} سفارش تسویه‌نشدهٔ آن حذف شد ✅`,
      });
    } else if (d.deleted) {
      ctx.setMsg({ ok: true, text: `پکیج «${p.name}» حذف شد ✅` });
    } else {
      ctx.setMsg({
        ok: true,
        text:
          `پکیج «${p.name}» غیرفعال شد؛ از فهرست فروش حذف نمی‌شود چون ` +
          `${(d.subscriptions ?? 0).toLocaleString("fa-IR")} اشتراک و ${(d.orders ?? 0).toLocaleString("fa-IR")} سفارش به آن وصل است.`,
      });
    }
    reload();
  }

  function addCustom() {
    const text = customText.trim();
    if (!text) return;
    setEditing((e) => (e ? { ...e, features: [...e.features, text] } : e));
    setCustomText("");
  }
  function toggleModule(key: string) {
    setEditing((e) => {
      if (!e) return e;
      const on = e.features.some((f) => typeof f !== "string" && f.key === key);
      if (on) return { ...e, features: e.features.filter((f) => !(typeof f !== "string" && f.key === key)) };
      const def = findModule(key);
      return { ...e, features: [...e.features, def?.kind === "count" ? { key, value: null } : { key }] };
    });
  }
  function setModuleValue(key: string, raw: string) {
    const value = raw === "" ? null : Math.max(0, Math.floor(Number(raw) || 0));
    setEditing((e) =>
      e ? { ...e, features: e.features.map((f) => (typeof f !== "string" && f.key === key ? { key, value } : f)) } : e
    );
  }
  function removeFeature(i: number) {
    setEditing((e) => (e ? { ...e, features: e.features.filter((_, idx) => idx !== i) } : e));
  }

  return (
    <div>
      <button
        onClick={() => setEditing({ id: null, name: "", plan: "BASIC", price: 0, yearlyPrice: null, durationDays: 30, features: [], isActive: true })}
        className={`${primaryBtn} mb-4`}
      >
        + پکیج جدید
      </button>

      {editing && (
        <div className="mb-4 rounded-2xl border border-pink-200 bg-pink-50/60 p-4 dark:border-pink-800 dark:bg-pink-950/20">
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={input} placeholder="نام پکیج" aria-label="نام پکیج" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <select className={input} value={editing.plan} onChange={(e) => setEditing({ ...editing, plan: e.target.value })} aria-label="پلن">
              {["FREE", "BASIC", "PRO", "ENTERPRISE"].map((p) => (
                <option key={p} value={p}>
                  {PLAN_TITLES[p]} ({p})
                </option>
              ))}
            </select>
            <input className={input} type="number" placeholder="قیمت ماهانه (تومان)" aria-label="قیمت ماهانه" value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
            <input className={input} type="number" placeholder="قیمت سالانه (اختیاری)" aria-label="قیمت سالانه" value={editing.yearlyPrice ?? ""} onChange={(e) => setEditing({ ...editing, yearlyPrice: e.target.value === "" ? null : Number(e.target.value) })} />
            <input className={input} type="number" placeholder="مدت (روز)" aria-label="مدت" value={editing.durationDays} onChange={(e) => setEditing({ ...editing, durationDays: Number(e.target.value) })} />
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={editing.isActive}
                onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                className="h-4 w-4 accent-pink-600"
              />
              در صفحه پکیج‌ها فروخته شود{editing.isActive ? "" : " (مخفی)"}
            </label>
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs font-bold text-neutral-600 dark:text-neutral-300">
              ماژول‌ها — از امکانات واقعی سامانه انتخاب کنید
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {MODULES.map((m) => {
                const selected = editing.features.find((f) => typeof f !== "string" && f.key === m.key);
                const on = Boolean(selected);
                return (
                  <div
                    key={m.key}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition ${
                      on
                        ? "border-pink-300 bg-white text-neutral-800 shadow-sm dark:border-pink-700 dark:bg-neutral-900 dark:text-neutral-100"
                        : "border-neutral-200 bg-transparent text-neutral-500 dark:border-neutral-700"
                    }`}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleModule(m.key)}
                        aria-label={m.label}
                        className="h-3.5 w-3.5 shrink-0 accent-pink-600"
                      />
                      <span className="shrink-0">{m.icon}</span>
                      <span className="truncate font-medium">{m.label}</span>
                    </label>
                    {m.kind === "count" && on && (
                      <input
                        type="number"
                        min={0}
                        value={typeof selected === "object" ? selected.value ?? "" : ""}
                        onChange={(e) => setModuleValue(m.key, e.target.value)}
                        placeholder="خالی = سقف پلن"
                        aria-label={`سقف ${m.label}`}
                        className="w-16 shrink-0 rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-center text-xs outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-800"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {editing.features.filter((f): f is string => typeof f === "string").length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-[11px] font-bold text-neutral-500">ماژول‌های دلخواه (متنی)</div>
                {editing.features.map((f, i) =>
                  typeof f === "string" ? (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                        {f}
                      </span>
                      <button onClick={() => removeFeature(i)} className={dangerBtn}>حذف</button>
                    </div>
                  ) : null
                )}
              </div>
            )}

            <div className="mt-2 flex gap-2">
              <input
                className={input}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom();
                  }
                }}
                placeholder="افزودن ماژول دلخواه (اختیاری)"
                aria-label="ماژول دلخواه"
              />
              <button onClick={addCustom} className={ghostBtn}>+</button>
            </div>

            <div className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[11px] text-neutral-600 dark:bg-neutral-900/40 dark:text-neutral-300">
              پیش‌نمایش در سایت:{" "}
              {editing.features.length === 0
                ? "هیچ ماژولی انتخاب نشده — صفحهٔ پکیج‌ها فهرست پیش‌فرض پلن را نشان می‌دهد."
                : normalizeFeatures(editing.features)
                    .map((f) => {
                      const text = `${moduleIcon(f)} ${moduleLabel(f)}`;
                      const isAutoCap = typeof f !== "string" && findModule(f.key)?.kind === "count" && f.value == null;
                      return isAutoCap ? `${text} (سقف پلن)` : text;
                    })
                    .join(" | ")}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={save} className={darkBtn}>ذخیره</button>
            <button onClick={() => setEditing(null)} className="rounded-xl bg-neutral-200 px-5 py-2 text-sm font-bold text-neutral-700 transition hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-300">انصراف</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {pkgs.length === 0 && <p className="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">پکیجی ساخته نشده است.</p>}
        {pkgs.map((p) => {
          const linked = (p.subscriptionCount ?? 0) + (p.orderCount ?? 0);
          const paidOrders = p.paidOrderCount ?? 0;
          return (
          <div key={p.id} className={`${listRow} flex flex-wrap items-center justify-between gap-2 ${p.isActive ? "" : "opacity-70"}`}>
            <div>
              <div className="font-bold text-neutral-800 dark:text-neutral-100">
                {p.name}{" "}
                <span className="text-xs font-normal text-neutral-400 dark:text-neutral-500">
                  {PLAN_TITLES[p.plan] ?? p.plan}
                  {!p.isActive && " · غیرفعال"}
                </span>
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                ماهانه: {p.price.toLocaleString("fa-IR")} — سالانه: {(p.yearlyPrice ?? p.price * 10).toLocaleString("fa-IR")} —{" "}
                {(p.featureLabels?.length ?? p.features?.length ?? 0).toLocaleString("fa-IR")} ماژول
                {linked > 0 && (
                  <span className="ml-1 rounded-lg bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    {p.subscriptionCount?.toLocaleString("fa-IR") ?? "۰"} اشتراک · {p.orderCount?.toLocaleString("fa-IR") ?? "۰"} سفارش
                  </span>
                )}
              </div>
              {p.featureLabels && p.featureLabels.length > 0 && (
                <div className="mt-1 flex max-w-xl flex-wrap gap-1">
                  {p.featureLabels.map((label, i) => (
                    <span key={i} className="rounded-lg bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setEditing({ id: p.id, name: p.name, plan: p.plan, price: p.price, yearlyPrice: p.yearlyPrice, durationDays: p.durationDays, features: normalizeFeatures(p.features), isActive: p.isActive })}
                className={ghostBtn}
              >
                ویرایش
              </button>
              <label className="flex cursor-pointer items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={p.isActive}
                  onChange={async (e) => {
                    const r = await ctx.api("/api/admin/packages", "PATCH", { id: p.id, isActive: e.target.checked });
                    if (r) reload();
                  }}
                  className="h-4 w-4 accent-pink-600"
                />
                فعال
              </label>
              {confirmId === p.id ? (
                <span className="flex flex-wrap items-center gap-1.5 rounded-xl bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {linked > 0 ? `${linked.toLocaleString("fa-IR")} مورد به این پکیج وصل است:` : "حذف شود؟"}
                  {linked > 0 ? (
                    <button onClick={() => remove(p)} disabled={busyId === p.id} className={ghostBtn}>
                      فقط غیرفعال شود
                    </button>
                  ) : (
                    <button onClick={() => remove(p)} disabled={busyId === p.id} className={dangerBtn}>
                      {busyId === p.id ? "در حال انجام…" : "بله، حذف شود"}
                    </button>
                  )}
                  {linked > 0 && (
                    <button
                      onClick={() => remove(p, true)}
                      disabled={busyId === p.id || paidOrders > 0}
                      title={paidOrders > 0 ? `${paidOrders.toLocaleString("fa-IR")} سفارش پرداخت‌شده دارد؛ برای حفظ اسناد مالی حذف قطعی مجاز نیست` : "اشتراک‌ها و سفارش‌های تسویه‌نشده هم حذف می‌شوند"}
                      className={paidOrders > 0 ? `${dangerBtn} cursor-not-allowed opacity-50` : dangerBtn}
                    >
                      حذف قطعی
                    </button>
                  )}
                  <button onClick={() => setConfirmId(null)} className={ghostBtn}>
                    انصراف
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmId(p.id)}
                  disabled={busyId === p.id}
                  title={linked > 0 ? "به این پکیج اشتراک یا سفارش وصل است؛ فقط غیرفعال می‌شود" : "حذف پکیج"}
                  className={dangerBtn}
                >
                  {linked > 0 ? "حذف/غیرفعال‌سازی" : "حذف"}
                </button>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── ماتریس محدودیت‌ها ───────────────────────────────────────────────── */

type LimitDefRow = {
  key: string;
  label: string;
  unit: string;
  kind: "count" | "bool";
  scope: "salon" | "owner";
  monthly?: boolean;
  icon: string;
  hint: string;
  max: number;
};
type LimitCellRow = {
  plan: string;
  key: string;
  fallback: number | boolean;
  override: string | null;
  effective: number | boolean;
  overridden: boolean;
  atDefault?: boolean;
};
type LimitMatrixData = {
  plans: { id: string; label: string }[];
  defs: LimitDefRow[];
  cells: Record<string, LimitCellRow>;
  issues?: string[];
  unlimitedFrom: number;
};

const faNum = (n: number | string) => new Intl.NumberFormat("fa-IR").format(Number(n) || 0);

/**
 * ماتریس «ردیف = محدودیت، ستون = پلن».
 *
 * هر خانه مستقیماً کلید `plan.limit.<PLAN>.<key>` را می‌نویسد؛ پس هر تغییر بدون
 * دیپلوی و در همان لحظه در سراسر سامانه (و صفحهٔ پکیج‌ها) اعمال می‌شود.
 * خانهٔ خالی/«پیش‌فرض» یعنی همان عددی که در `PLAN_DEFAULTS` تعریف شده است.
 */
function LimitMatrixPanel({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<LimitMatrixData | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/limits");
      const d = (await res.json()) as ApiRes<LimitMatrixData>;
      if (d.success) {
        setData(d);
        setFailed(false);
      } else {
        setFailed(true);
        ctx.setMsg({ ok: false, text: d.error ?? "خطا در خواندن محدودیت‌ها" });
      }
    } catch {
      setFailed(true);
      ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    }
  }, [ctx]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/limits")
      .then((r) => r.json())
      .then((d: ApiRes<LimitMatrixData>) => {
        if (cancelled) return;
        if (d.success) setData(d);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data)
    return failed ? (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-red-600">ماتریس محدودیت‌ها در دسترس نیست.</div>
    ) : (
      <div className="py-10 text-center text-neutral-400">در حال بارگیری محدودیت‌ها...</div>
    );

  const ck = (plan: string, key: string) => `${plan}:${key}`;
  const valueOf = (cell: LimitCellRow | undefined) => {
    if (!cell) return "";
    return draft[ck(cell.plan, cell.key)] ?? String(cell.effective);
  };
  const dirtyKeys = Object.keys(draft);
  // بعد از guard بالا `data` قطعاً مقدار دارد (متغیر محلی برای تشخیص تایپ در توابع داخلی)
  const matrix = data;

  async function persist(updates: { plan: string; key: string; value: string | number | boolean | null }[], okMsg: string) {
    if (!updates.length) return;
    setSaving(true);
    const d = await ctx.api<ApiRes<{ saved: number; matrix: LimitMatrixData }>>("/api/admin/limits", "PATCH", { updates }, okMsg);
    setSaving(false);
    if (d?.matrix) {
      setData(d.matrix);
      setDraft({});
    }
  }

  function saveDirty() {
    const updates = dirtyKeys.flatMap((key) => {
      const [plan, limitKey] = key.split(":");
      const def = matrix.defs.find((x) => x.key === limitKey);
      if (!def) return [];
      const raw = draft[key];
      const value =
        def.kind === "bool"
          ? raw === "true"
          : raw.trim() === "" || raw === "null"
            ? null
            : Number(raw.replace(/[^\d]/g, ""));
      return [{ plan, key: limitKey, value }];
    });
    void persist(updates, `${faNum(updates.length)} محدودیت به‌روزرسانی شد ✅`);
  }

  function resetAll() {
    const updates: { plan: string; key: string; value: null }[] = [];
    for (const plan of matrix.plans) {
      for (const def of matrix.defs) {
        const cell = matrix.cells[ck(plan.id, def.key)];
        if (cell?.overridden) updates.push({ plan: plan.id, key: def.key, value: null });
      }
    }
    if (!updates.length) {
      ctx.setMsg({ ok: true, text: "همهٔ سقف‌ها همین حالا روی پیش‌فرض پلن‌ها هستند." });
      return;
    }
    void persist(updates, `${faNum(updates.length)} سقف به پیش‌فرض پلن برگشت ✅`);
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">ماتریس محدودیت پلن‌ها</h3>
            <p className="mt-1 text-sm text-neutral-500">
              هر خانه یک تنظیم واقعی به شکل <span dir="ltr" className="font-mono text-xs">plan.limit.&lt;PLAN&gt;.&lt;key&gt;</span> است.
              با تغییر همین اعداد، سقف‌ها در داشبورد سالن‌ها، صفحهٔ پکیج‌ها و صف پیامک فوراً عوض می‌شود — بدون تغییر کد.
            </p>
          </div>
          <div className="flex gap-2">
            <button className={ghostBtn} onClick={() => void reload()} disabled={saving}>
              بازخوانی
            </button>
            <button className={dangerBtn} onClick={resetAll} disabled={saving}>
              بازگشت همه به پیش‌فرض
            </button>
            <button className={primaryBtn} onClick={saveDirty} disabled={saving || dirtyKeys.length === 0}>
              {saving ? "در حال ذخیره..." : dirtyKeys.length ? `ذخیره ${faNum(dirtyKeys.length)} تغییر` : "تغییری نیست"}
            </button>
          </div>
        </div>

        {!!data.issues?.length && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            ⚠️ ناهماهنگی کاتالوگ: {data.issues.join(" — ")}
          </p>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="text-right">
                <th className="sticky right-0 z-10 bg-white px-3 py-2.5 text-xs font-black text-neutral-500 dark:bg-neutral-900">محدودیت</th>
                {data.plans.map((p) => (
                  <th key={p.id} className="px-3 py-2.5 text-center text-xs font-black text-neutral-700 dark:text-neutral-200">
                    {p.label}
                    <div dir="ltr" className="text-[10px] font-medium text-neutral-400">
                      {p.id}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.defs.map((def) => (
                <tr key={def.key} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="sticky right-0 z-10 bg-white px-3 py-3 align-top dark:bg-neutral-900">
                    <div className="font-bold text-neutral-800 dark:text-neutral-100">
                      {def.icon} {def.label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-5 text-neutral-400">{def.hint}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {def.monthly && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                          شمارش ماهانه
                        </span>
                      )}
                      {def.scope === "owner" && (
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                          سطح کاربر
                        </span>
                      )}
                      {def.kind === "bool" && (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800">
                          امکان روشن/خاموش
                        </span>
                      )}
                    </div>
                  </td>
                  {data.plans.map((p) => {
                    const cell = data.cells[ck(p.id, def.key)];
                    const key = ck(p.id, def.key);
                    const val = valueOf(cell);
                    const edited = key in draft;
                    const custom = cell?.overridden ? cell : null;
                    return (
                      <td key={p.id} className="px-2 py-3 text-center align-top">
                        {def.kind === "bool" ? (
                          <select
                            value={val}
                            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                            className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs font-bold text-neutral-800 outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          >
                            <option value="true">فعال</option>
                            <option value="false">غیرفعال</option>
                          </select>
                        ) : (
                          <input
                            dir="ltr"
                            type="number"
                            min={0}
                            max={def.max}
                            step={1}
                            value={val}
                            onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                            className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-center text-xs font-bold text-neutral-800 outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          />
                        )}
                        <div className="mt-1 text-[10px] font-bold">
                          {edited ? (
                            <span className="text-pink-600">ذخیره نشده</span>
                          ) : custom ? (
                            <button
                              className={cell!.atDefault ? "text-neutral-400 underline decoration-dotted hover:text-neutral-600" : "text-amber-600 underline decoration-dotted hover:text-amber-700"}
                              title={
                                cell!.atDefault
                                  ? "یک رکورد تنظیمات برای این خانه وجود دارد ولی همان عدد پیش‌فرض است؛ کلیک کنید تا حذف شود"
                                  : "این خانه دست‌ی است؛ برای بازگشت به پیش‌فرض پلن کلیک کنید"
                              }
                              onClick={() => void persist([{ plan: p.id, key: def.key, value: null }], `«${def.label}» پلن ${p.label} به پیش‌فرض برگشت ✅`)}
                            >
                              {cell!.atDefault ? "مساوی پیش‌فرض · پاک‌سازی" : "دستی · بازگشت"}
                            </button>
                          ) : (
                            <span className="text-neutral-400">پیش‌فرض {p.label}</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[11px] leading-6 text-neutral-400">
          💡 از عدد {faNum(data.unlimitedFrom)} به بالا، سقف در صفحهٔ پکیج‌ها و داشبورد «نامحدود» خوانده می‌شود؛ پس برای
          بی‌سقف کردن یک پلن همان عدد را وارد کنید. سقف «پیامک ارسالی در ماه» روی صف پیامک اعمال می‌شود؛ پیامک‌های تأیید
          شماره و اطلاع‌رسانی‌های پلتفرمی محدود نمی‌شوند.
        </p>
      </div>
    </div>
  );
}

/* ─── پشتیبانی ───────────────────────────────────────────────────────── */

function SupportManager({ ctx }: { ctx: Ctx }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({ OPEN: 0, IN_PROGRESS: 0, CLOSED: 0 });
  const [statusFilter, setStatusFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/admin/support?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setTickets(d.tickets as Ticket[]);
          setSummary(d.summary as Record<string, number>);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  async function reload() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    const r = await fetch(`/api/admin/support?${params}`);
    const d = await r.json();
    if (d.success) {
      setTickets(d.tickets as Ticket[]);
      setSummary(d.summary as Record<string, number>);
    }
  }

  async function update(id: string, patch: Record<string, unknown>) {
    const d = await ctx.api("/api/admin/support", "PATCH", { id, ...patch });
    if (d) reload();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { value: "", label: "همه" },
          { value: "OPEN", label: `باز (${summary.OPEN ?? 0})` },
          { value: "IN_PROGRESS", label: `در بررسی (${summary.IN_PROGRESS ?? 0})` },
          { value: "CLOSED", label: `بسته (${summary.CLOSED ?? 0})` },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              statusFilter === f.value
                ? "bg-gradient-to-l from-pink-600 to-purple-600 text-white shadow-md shadow-pink-500/25"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {tickets.length === 0 && <p className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">درخواستی یافت نشد.</p>}
        {tickets.map((t) => {
          const st = TICKET_STATUS[t.status] ?? { label: t.status, cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" };
          return (
            <div key={t.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-neutral-800 dark:text-neutral-100">{t.subject}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t.user?.name ?? t.name ?? "کاربر"} — <span dir="ltr">{t.phone || t.email || t.user?.phone || "—"}</span> — {t.category}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                  {t.status !== "IN_PROGRESS" && (
                    <button onClick={() => update(t.id, { status: "IN_PROGRESS" })} className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-900/40">
                      در بررسی
                    </button>
                  )}
                  {t.status !== "CLOSED" && (
                    <button onClick={() => update(t.id, { status: "CLOSED" })} className={okBtn}>بستن</button>
                  )}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600 dark:text-neutral-300">{t.message}</p>
              {t.adminReply && (
                <div className="mt-2 rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-800">
                  <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">پاسخ فعلی: </span>
                  <span className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-200">{t.adminReply}</span>
                </div>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <textarea
                  className={`${input} min-h-[64px] flex-1`}
                  placeholder="پاسخ به کاربر..."
                  aria-label={`پاسخ به ${t.subject}`}
                  value={drafts[t.id] ?? ""}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                />
                <button
                  onClick={async () => {
                    const reply = (drafts[t.id] ?? "").trim();
                    if (!reply) return ctx.setMsg({ ok: false, text: "متن پاسخ خالی است" });
                    await update(t.id, { adminReply: reply, status: "CLOSED" });
                    setDrafts((prev) => ({ ...prev, [t.id]: "" }));
                  }}
                  className={primaryBtn}
                >
                  ارسال پاسخ
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── گزارش اعلان‌ها ─────────────────────────────────────────────────── */

function NotificationReport({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<NotifData | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (channelFilter) params.set("channel", channelFilter);
    fetch(`/api/admin/notifications?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setData({ summary: d.summary as Record<string, number>, notifications: d.notifications as NotifItem[] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statusFilter, channelFilter]);

  async function reload() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (channelFilter) params.set("channel", channelFilter);
    const r = await fetch(`/api/admin/notifications?${params}`);
    const d = await r.json();
    if (d.success) setData({ summary: d.summary as Record<string, number>, notifications: d.notifications as NotifItem[] });
  }

  async function retry(id?: string) {
    setBusy(true);
    const d = await ctx.api<ApiRes<{ reset?: number }>>("/api/admin/notifications", "POST", id ? { id } : {});
    if (d) {
      ctx.setMsg({ ok: true, text: `${d.reset ?? 0} اعلان برای تلاش مجدد بازنشانی شد.` });
      reload();
    }
    setBusy(false);
  }

  if (!data) return <p className="py-6 text-center text-neutral-400 dark:text-neutral-500">در حال بارگیری...</p>;
  const s = data.summary;
  const cards = [
    { label: "در صف", value: String(s.PENDING ?? 0), icon: "⏳" },
    { label: "ارسال‌شده", value: String(s.SENT ?? 0), icon: "✅" },
    { label: "ناموفق", value: String(s.FAILED ?? 0), icon: "⚠️" },
    { label: "حذف‌شده", value: String(s.DROPPED ?? 0), icon: "🗑" },
    { label: "هزینه تخمینی (تومان)", value: (s.estimatedCost ?? 0).toLocaleString("fa-IR"), icon: "💸" },
  ];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-xl">{c.icon}</div>
            <div className="mt-1 text-lg font-black text-neutral-900 dark:text-neutral-100">{c.value}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className={`${input} sm:w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="وضعیت">
          <option value="">همه وضعیت‌ها</option>
          <option value="PENDING">در صف</option>
          <option value="SENT">ارسال‌شده</option>
          <option value="FAILED">ناموفق</option>
          <option value="DROPPED">حذف‌شده</option>
        </select>
        <select className={`${input} sm:w-auto`} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} aria-label="کانال">
          <option value="">همه کانال‌ها</option>
          <option value="SMS">پیامک</option>
          <option value="EMAIL">ایمیل</option>
          <option value="IN_APP">درون‌برنامه‌ای</option>
        </select>
        <button onClick={() => retry()} disabled={busy} className={`${darkBtn} disabled:opacity-50`}>
          {busy ? "در حال تلاش..." : "تلاش مجدد برای همه ناموفق‌ها"}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {data.notifications.length === 0 && <p className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">اعلانی یافت نشد.</p>}
        {data.notifications.map((n) => (
          <div key={n.id} className={`${listRow} flex flex-wrap items-center justify-between gap-2`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-neutral-800 dark:text-neutral-100">{n.type}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{n.channel}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{n.status}</span>
                {n.attempts > 0 && <span className="text-[11px] text-neutral-400">تلاش: {n.attempts}</span>}
              </div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400" dir="ltr">{n.recipient}</div>
              {n.lastError && <div className="mt-1 text-xs text-red-500">{String(n.lastError).slice(0, 160)}</div>}
              <div className="text-[11px] text-neutral-400 dark:text-neutral-500">{new Date(n.createdAt).toLocaleString("fa-IR")}</div>
            </div>
            {(n.status === "FAILED" || n.status === "DROPPED") && (
              <button onClick={() => retry(n.id)} disabled={busy} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-300">
                تلاش مجدد
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── امنیت و رمز عبور ──────────────────────────────────────────────── */

function SecurityView({ ctx }: { ctx: Ctx }) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/password/status")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setHasPassword(Boolean(d.hasPassword));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const strength =
    password.length === 0
      ? null
      : password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password)
        ? { label: "قوی", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
        : password.length >= 8
          ? { label: "متوسط — عدد و حرف انگلیسی لازم است", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
          : { label: "ضعیف — حداقل ۸ کاراکتر", cls: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" };

  async function save() {
    if (password !== confirm) return ctx.setMsg({ ok: false, text: "تکرار رمز عبور یکسان نیست." });
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, currentPassword: hasPassword ? current : undefined }),
      });
      const d = await res.json();
      if (!d.success) return ctx.setMsg({ ok: false, text: d.error ?? "خطا در تنظیم رمز" });
      ctx.setMsg({ ok: true, text: "رمز عبور تنظیم شد ✅ از این پس ورود ادمین با رمز انجام می‌شود." });
      setHasPassword(true);
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className={card}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-indigo-100 text-xl dark:from-sky-900/40 dark:to-indigo-900/40">🔐</span>
          <div>
            <h3 className="font-extrabold text-neutral-900 dark:text-neutral-100">رمز عبور ورود</h3>
            <p className="text-xs text-neutral-400">ورود ادمین پس از تنظیم رمز، حتماً با رمز عبور انجام می‌شود</p>
          </div>
        </div>

        <div className="mt-4">
          {hasPassword === null ? (
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">در حال بررسی...</span>
          ) : hasPassword ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">✅ رمز عبور فعال است</span>
          ) : (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⚠️ رمز عبور تنظیم نشده — ورود فقط با کد پیامکی</span>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {hasPassword && (
            <input className={input} type={showPw ? "text" : "password"} placeholder="رمز عبور فعلی" value={current} onChange={(e) => setCurrent(e.target.value)} />
          )}
          <input className={input} type={showPw ? "text" : "password"} placeholder="رمز عبور جدید" value={password} onChange={(e) => setPassword(e.target.value)} />
          {strength && (
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${strength.cls}`}>{strength.label}</span>
          )}
          <input className={input} type={showPw ? "text" : "password"} placeholder="تکرار رمز عبور جدید" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} className="h-4 w-4 accent-pink-600" />
            نمایش رمز عبور
          </label>
          <button onClick={save} disabled={busy || password.length < 8 || confirm.length < 8} className={`${primaryBtn} w-full`}>
            {busy ? "در حال ذخیره..." : hasPassword ? "تغییر رمز عبور" : "تنظیم رمز عبور"}
          </button>
        </div>
      </div>

      <div className={`${card} flex flex-col justify-between`}>
        <div>
          <h3 className="font-extrabold text-neutral-900 dark:text-neutral-100">راهنمای امنیت ورود</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            <li className="flex gap-2"><span>🛡️</span><span>رمز عبور باید حداقل ۸ کاراکتر و ترکیبی از حروف انگلیسی و عدد باشد.</span></li>
            <li className="flex gap-2"><span>🔑</span><span>بعد از تنظیم رمز، ورود ادمین در دو مرحله انجام می‌شود: کد تأیید پیامکی + رمز عبور.</span></li>
            <li className="flex gap-2"><span>⏱️</span><span>پس از ۱۰ تلاش ناموفق، ورود با رمز به مدت ۱۰ دقیقه مسدود می‌شود.</span></li>
            <li className="flex gap-2"><span>✉️</span><span>سایر کاربران می‌توانند بدون رمز و مستقیم با ایمیل (جیمیل و...) یا کد پیامکی وارد شوند.</span></li>
          </ul>
        </div>
        <div className="mt-5 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
          💡 برای تغییر رمز فراموش‌شده، ابتدا با کد پیامکی وارد شوید و سپس از همین بخش رمز را عوض کنید.
        </div>
      </div>
    </div>
  );
}

/* ─── کامپوننت اصلی ──────────────────────────────────────────────────── */

export default function AdminExtras({ initialTab = "metrics" }: { initialTab?: string }) {
  // تب از سایدبار می‌آید؛ والد با key={tab} باعث remount در هر تغییر می‌شود
  const tab = initialTab;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);

  const refreshSalons = useCallback(async () => {
    const r = await fetch("/api/salons");
    const d = await r.json();
    if (d.success) setSalons(d.salons as Salon[]);
  }, []);

  const refreshDiscounts = useCallback(async () => {
    const r = await fetch("/api/admin/discounts");
    const d = await r.json();
    if (d.success) setDiscounts(d.discounts as Discount[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/salons"), fetch("/api/admin/discounts")])
      .then((rs) => Promise.all(rs.map((r) => r.json())))
      .then(([s, d]) => {
        if (cancelled) return;
        if (s.success && s.salons) setSalons(s.salons as Salon[]);
        if (d.success && d.discounts) setDiscounts(d.discounts as Discount[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function api<T = ApiRes>(path: string, method: string, body?: unknown, okMsg?: string): Promise<T | null> {
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = (await res.json()) as T;
      if (!(d as ApiRes).success) {
        setMsg({ ok: false, text: String((d as ApiRes).error ?? "خطا") });
        return null;
      }
      setMsg({ ok: true, text: okMsg ?? "ذخیره شد ✅" });
      return d;
    } catch {
      setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
      return null;
    }
  }

  const ctx: Ctx = { api, setMsg };

  return (
    <div>
      {msg && <p className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"}`}>{msg.text}</p>}

      <div className="mt-6">
        {tab === "metrics" && <MetricsManager ctx={ctx} />}
        {tab === "support" && <SupportManager ctx={ctx} />}
        {tab === "notifications" && <NotificationReport ctx={ctx} />}
        {tab === "charts" && <AdminCharts />}
        {tab === "salons" && <SalonManagerList ctx={ctx} salons={salons} refresh={refreshSalons} />}
        {tab === "reviews" && <ReviewManager ctx={ctx} />}
        {tab === "subscriptions" && <SubscriptionManager ctx={ctx} />}
        {tab === "users" && <UserManager ctx={ctx} />}
        {tab === "packages" && <PackageManager ctx={ctx} />}
        {tab === "limits" && <LimitMatrixPanel ctx={ctx} />}
        {tab === "discounts" && <DiscountManager ctx={ctx} discounts={discounts} refresh={refreshDiscounts} />}
        {tab === "sms" && (
          <>
            <SentCodesToggle ctx={ctx} />
            <SmsTest ctx={ctx} />
          </>
        )}
        {tab === "broadcast" && <BroadcastView ctx={ctx} />}
        {tab === "audit" && <AuditView ctx={ctx} />}
        {tab === "security" && <SecurityView ctx={ctx} />}
        {tab === "settings" && <SystemSettings />}
      </div>
    </div>
  );
}
