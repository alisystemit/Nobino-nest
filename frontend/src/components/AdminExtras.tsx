"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminCharts from "@/components/AdminCharts";
import SystemSettings from "@/components/SystemSettings";
import AiSettings from "@/components/AiSettings";
import SalonIcon from "@/components/icons/SalonIcon";
import { MODULES, findModule, moduleIcon, moduleLabel, normalizeFeatures, type StoredFeature } from "@/lib/plans/modules";
import Pagination from "@/components/ui/Pagination";
import AdminBackups from "@/components/AdminBackups";

/* ─── تایپ‌ها ────────────────────────────────────────────────────────── */

type ApiRes<T = Record<string, unknown>> = { success: boolean; error?: string } & T;

type Discount = { id: string; code: string; percent: number; maxUses: number | null; usedCount: number; isActive: boolean; expiresAt?: string | null; createdAt?: string };
type Salon = { id: string; name: string; slug: string; owner: { phone: string } | null; isApproved: boolean; isActive: boolean; instagram?: string | null; city?: string | null; plan?: string; customDomain?: string | null; domainStatus?: string; trialEndsAt?: string | null; subscriptionEndsAt?: string | null; createdAt?: string; _count?: { appointments: number } };
type SalonDetail = {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  description?: string | null;
  isApproved: boolean;
  isActive: boolean;
  createdAt: string;
  customDomain?: string | null;
  domainStatus?: string | null;
  instagram?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  mapUrl?: string | null;
  neshanUrl?: string | null;
  baladUrl?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  coverColor?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  plan?: string;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
  autoRenew?: boolean;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  cancelDeadlineHours?: number;
  bufferMinutes?: number;
  updatedAt?: string;
  publicUrl?: string;
  owner?: { name?: string | null; phone?: string | null; email?: string | null; role?: string } | null;
  _count: {
    appointments: number;
    staff: number;
    services: number;
    branches: number;
    reviews: number;
    orders: number;
    customers: number;
    galleryItems: number;
    invoices: number;
    campaigns: number;
    waitlist: number;
    favorites: number;
    voiceCalls?: number;
    holidays?: number;
    timeBlocks?: number;
    webhooks?: number;
    cashEntries?: number;
    subscriptions?: number;
  };
  paidRevenue?: number;
  outstandingAmount?: number;
  outstandingCount?: number;
  appointmentsByStatus?: Record<string, number>;
  subscription?: { plan: string; name?: string; price?: number; endsAt: string; period?: string; status?: string } | null;
  recentAppointments?: { id: string; customerName: string; customerPhone?: string; startAt: string; status: string; service?: { name: string } | null; employee?: { name: string } | null }[];
  recentCustomers?: { firstName?: string | null; lastName?: string | null; name?: string | null; phone: string; visits: number; spend: number; lastVisitAt?: string | null }[];
  services?: { id: string; name: string; price: number; durationMin: number; isActive: boolean }[];
  staffList?: { id: string; name: string; title?: string | null; isActive: boolean }[];
  activeCampaigns?: { id: string; name: string; channel: string; status: string }[];
  latestInvoice?: { id: string; number: string; amount: number; status: string; createdAt: string } | null;
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
type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  actorPhone?: string | null;
  actorId?: string | null;
  entityId?: string | null;
  entityName?: string | null;
  actorName?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  createdAt: string;
};
type Subscription = {
  id: string;
  salon?: { name: string; slug?: string; phone?: string | null } | null;
  package?: { name: string; plan?: string } | null;
  startsAt?: string;
  endsAt: string;
  period: string;
  autoRenew?: boolean;
  status: string;
  cancelledAt?: string | null;
  createdAt?: string;
};
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
  nextAttemptAt?: string | null;
  createdAt: string;
  sentAt?: string | null;
  salonName?: string | null;
};
type NotifSummary = {
  PENDING?: number;
  SENT?: number;
  FAILED?: number;
  DROPPED?: number;
  channels?: Record<string, number>;
  estimatedCost?: number;
  unitCost?: number;
};
type NotifData = { summary: NotifSummary; notifications: NotifItem[] };

type Payout = {
  id: string;
  amount: number;
  method: string;
  bankInfo?: string | null;
  status: string;
  requestedAt: string;
  processedAt?: string | null;
  walletBalance: number;
  owner?: { id: string; name?: string | null; phone?: string | null } | null;
};

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

/* ─── برچسب/ابزارهای مشترک بخش سالن ──────────────────────────────────── */

const PLAN_LABEL: Record<string, string> = { FREE: "رایگان", BASIC: "پایه", PRO: "حرفه‌ای", ENTERPRISE: "سازمانی" };
const planLabel = (p?: string | null) => (p ? PLAN_LABEL[p] ?? p : "—");
const planBadgeCls = (p?: string | null) => {
  switch (p) {
    case "ENTERPRISE":
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
    case "PRO":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
    case "BASIC":
      return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
    default:
      return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300";
  }
};
const faDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fa-IR") : "—");
const faDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString("fa-IR") : "—");
const domainLabel = (s?: string | null) => (s === "VERIFIED" ? "دامنه تأییدشده" : s === "PENDING" ? "دامنه در انتظار" : "بدون دامنه");
const domainBadgeCls = (s?: string | null) =>
  s === "VERIFIED"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    : s === "PENDING"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400";
/** روز باقی‌مانده (منفی = گذشته)؛ null وقتی تاریخی نیست */
const daysLeft = (d?: string | null): number | null => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 864e5) : null);
const faInt = (n?: number | null) => (typeof n === "number" ? n.toLocaleString("fa-IR") : "—");

/** یک جفت «برچسب: مقدار» برای کارت جزئیات؛ در صورت href لینک بیرونی می‌شود */
function Info({ label, value, href, dir }: { label: string; value?: string | null; href?: string; dir?: "ltr" }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs dark:bg-neutral-900/40">
      <span className="shrink-0 text-neutral-400 dark:text-neutral-500">{label}</span>
      {href && value ? (
        <a href={href} target="_blank" rel="noopener noreferrer" dir={dir ?? "ltr"} className="truncate text-pink-600 hover:underline dark:text-pink-400">
          {value}
        </a>
      ) : (
        <span className="truncate font-bold text-neutral-800 dark:text-neutral-100" dir={dir}>{value && value.trim() ? value : "—"}</span>
      )}
    </div>
  );
}

/* ─── کدهای تخفیف ────────────────────────────────────────────────────── */

function DiscountManager({ ctx }: { ctx: Ctx }) {
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [maxUses, setMaxUses] = useState(0);
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);

  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ total: 0, active: 0, used: 0 });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/discounts?page=${page}&limit=25`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setDiscounts(d.discounts as Discount[]);
          setTotal(d.total ?? 0);
          setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
          if (d.counts) setCounts(d.counts);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page]);

  async function reload() {
    const r = await fetch(`/api/admin/discounts?page=${page}&limit=25`);
    const d = await r.json();
    if (d.success) {
      setDiscounts(d.discounts as Discount[]);
      setTotal(d.total ?? 0);
      setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
      if (d.counts) setCounts(d.counts);
    }
  }

  // ویرایش داخل کارت
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPercent, setEditPercent] = useState(0);
  const [editMaxUses, setEditMaxUses] = useState(0);
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const now = Date.now();
  const expired = (d: Discount) => (d.expiresAt ? new Date(d.expiresAt).getTime() <= now : false);
  const activeCount = counts.active;
  const totalUsed = counts.used;

  const toDateVal = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

  async function create() {
    const c = code.trim().toUpperCase();
    if (!c) return ctx.setMsg({ ok: false, text: "کد تخفیف را وارد کنید" });
    if (!percent || percent < 1 || percent > 100) return ctx.setMsg({ ok: false, text: "درصد باید بین ۱ تا ۱۰۰ باشد" });
    setCreating(true);
    const iso = expiresAt ? new Date(`${expiresAt}T00:00:00`).toISOString() : null;
    const r = await ctx.api(
      "/api/admin/discounts",
      "POST",
      { code: c, percent: Number(percent), maxUses: Number(maxUses), expiresAt: iso },
      "کد تخفیف ساخته شد ✅"
    );
    setCreating(false);
    if (r) {
      setCode("");
      setPercent(10);
      setMaxUses(0);
      setExpiresAt("");
      reload();
    }
  }

  async function toggle(d: Discount) {
    const r = await ctx.api(`/api/admin/discounts/${d.id}`, "PATCH", { isActive: !d.isActive }, d.isActive ? "کد غیرفعال شد" : "کد فعال شد ✅");
    if (r) reload();
  }

  async function remove(d: Discount) {
    if (!window.confirm(`کد «${d.code}» حذف شود؟`)) return;
    const r = await ctx.api(`/api/admin/discounts/${d.id}`, "DELETE", undefined, "کد تخفیف حذف شد ✅");
    if (r) reload();
  }

  function startEdit(d: Discount) {
    setEditingId(d.id);
    setEditPercent(d.percent);
    setEditMaxUses(d.maxUses ?? 0);
    setEditExpiresAt(toDateVal(d.expiresAt));
  }

  async function saveEdit(d: Discount) {
    setSavingEdit(true);
    const iso = editExpiresAt ? new Date(`${editExpiresAt}T00:00:00`).toISOString() : null;
    const r = await ctx.api(
      `/api/admin/discounts/${d.id}`,
      "PATCH",
      { percent: Number(editPercent), maxUses: Number(editMaxUses), expiresAt: iso },
      "کد تخفیف به‌روزرسانی شد ✅"
    );
    setSavingEdit(false);
    if (r) {
      setEditingId(null);
      reload();
    }
  }

  async function copy(d: Discount) {
    try {
      await navigator.clipboard.writeText(d.code);
      setCopiedId(d.id);
      setTimeout(() => setCopiedId((cur) => (cur === d.id ? null : cur)), 1500);
    } catch {
      ctx.setMsg({ ok: false, text: "کپی با خطا مواجه شد" });
    }
  }

  const stat = (label: string, value: string, tone: string, sub: string) => (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{label}</div>
      <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-neutral-100">{value}</div>
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{sub}</div>
    </div>
  );

  return (
    <div>
      {/* راهنما */}
      <div className="rounded-2xl border border-pink-100 bg-gradient-to-l from-pink-50 to-purple-50 p-4 dark:border-pink-900/40 dark:from-pink-950/20 dark:to-purple-950/20">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm dark:bg-neutral-800">💡</span>
          <div>
            <h3 className="text-sm font-black text-neutral-800 dark:text-neutral-100">کد تخفیف چیست و چگونه کار می‌کند؟</h3>
            <ul className="mt-2 space-y-1 text-xs leading-6 text-neutral-600 dark:text-neutral-300">
              <li>• کد تخفیف هنگام <b>پرداخت پکیج/اشتراک</b> توسط مشتری وارد می‌شود و درصدی از مبلغ را کم می‌کند.</li>
              <li>• کدها به‌صورت <b>حروف بزرگ</b> ثبت و استفاده می‌شوند (مشتری می‌تواند کوچک تایپ کند).</li>
              <li>• با <b>سقف استفاده</b> می‌توانید تعداد دفعات مصرف را محدود کنید؛ «۰» یعنی نامحدود.</li>
              <li>• کدهای <b>منقضی</b> یا <b>غیرفعال</b> در پرداخت پذیرفته نمی‌شوند.</li>
              <li>• هر کد فقط یک‌بار در هر پرداخت قابل استفاده است و شمارندهٔ مصرف به‌صورت خودکار افزایش می‌یابد.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* آمار */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stat("کل کدها", faInt(total), "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300", "همه کدهای تخفیف")}
        {stat("فعال", faInt(activeCount), "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", "قابل استفاده در پرداخت")}
        {stat("استفاده‌شده", faInt(totalUsed), "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300", "مجموع دفعات مصرف")}
      </div>

      {/* فرم ساخت */}
      <div className="mt-5 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-lg text-white">🏷️</span>
          <div>
            <h3 className="font-black text-neutral-900 dark:text-neutral-100">ساخت کد تخفیف جدید</h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">پس از ساخت، کد در صفحهٔ پرداخت پکیج قابل استفاده است.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-neutral-500 dark:text-neutral-400">کد</label>
            <input className={input} placeholder="مثلاً NOBINO20" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">فقط حروف و اعداد؛ خودکار با حروف بزرگ ذخیره می‌شود.</p>
          </div>
          <div>
            <label className="mb-1.5 flex items-center justify-between text-xs font-bold text-neutral-500 dark:text-neutral-400">
              <span>درصد تخفیف</span>
              <span className="rounded-full bg-pink-50 px-2.5 py-0.5 text-pink-600 dark:bg-pink-950/40 dark:text-pink-300">{faInt(percent)}٪</span>
            </label>
            <input type="range" min={1} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="w-full accent-pink-600" />
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">درصد کسر از مبلغ نهایی پرداخت پکیج.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-neutral-500 dark:text-neutral-400">سقف استفاده (۰ = نامحدود)</label>
            <input className={input} type="number" min={0} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} />
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">تعداد دفعاتی که این کد قابل استفاده است.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-neutral-500 dark:text-neutral-400">تاریخ انقضا (اختیاری)</label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={input} />
            <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">خالی = بدون انقضا؛ بعد از این تاریخ کد منقضی می‌شود.</p>
          </div>
        </div>

        <button onClick={create} disabled={creating} className={`${primaryBtn} mt-4 w-full sm:w-auto disabled:opacity-50`}>
          {creating ? "در حال ساخت..." : "ساخت کد تخفیف"}
        </button>
      </div>

      {/* لیست */}
      <h3 className="mb-3 mt-6 text-sm font-extrabold text-neutral-700 dark:text-neutral-200">
        کدهای موجود ({faInt(total)})
      </h3>
      <div className="space-y-3">
        {discounts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 py-10 text-center dark:border-neutral-700">
            <div className="text-4xl">🏷️</div>
            <p className="mt-3 text-sm font-black text-neutral-600 dark:text-neutral-300">هنوز کد تخفیفی ساخته نشده است</p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              از فرم بالا اولین کد را بسازید تا مشتریان بتوانند هنگام خرید پکیج از تخفیف استفاده کنند.
            </p>
          </div>
        )}

        {discounts.map((d) => {
          const isExpired = expired(d);
          const limit = d.maxUses ?? 0;
          const unlimited = limit === 0;
          const pct = unlimited ? 8 : Math.min(100, Math.round((d.usedCount / Math.max(1, limit)) * 100));
          const remaining = Math.max(0, limit - d.usedCount);
          const statusCls = !d.isActive
            ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
            : isExpired
              ? "bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400"
              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
          const statusLabel = !d.isActive ? "غیرفعال" : isExpired ? "منقضی" : "فعال";
          const isEditing = editingId === d.id;
          return (
            <div key={d.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-100 to-purple-100 text-lg dark:from-pink-950/40 dark:to-purple-950/40">🏷️</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black tracking-wide text-neutral-900 dark:text-neutral-100" dir="ltr">{d.code}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusCls}`}>{statusLabel}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {faInt(d.percent)}٪ تخفیف · ساخته‌شده در {faDate(d.createdAt)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => copy(d)} className={ghostBtn}>{copiedId === d.id ? "✔ کپی شد" : "کپی"}</button>
                  <button onClick={() => (isEditing ? setEditingId(null) : startEdit(d))} className={ghostBtn}>{isEditing ? "لغو" : "ویرایش"}</button>
                  <button onClick={() => toggle(d)} className={ghostBtn}>{d.isActive ? "غیرفعال" : "فعال‌سازی"}</button>
                  <button onClick={() => remove(d)} className={dangerBtn}>حذف</button>
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-neutral-100 bg-neutral-50/60 px-4 py-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                  <h4 className="mb-3 text-xs font-extrabold text-neutral-700 dark:text-neutral-200">ویرایش کد</h4>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold text-neutral-500">درصد تخفیف: {faInt(editPercent)}٪</label>
                      <input type="range" min={1} max={100} value={editPercent} onChange={(e) => setEditPercent(Number(e.target.value))} className="w-full accent-pink-600" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold text-neutral-500">سقف استفاده (۰ = نامحدود)</label>
                      <input className={input} type="number" min={0} value={editMaxUses} onChange={(e) => setEditMaxUses(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold text-neutral-500">تاریخ انقضا (اختیاری)</label>
                      <input type="date" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} className={input} />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => saveEdit(d)} disabled={savingEdit} className={`${darkBtn} h-10 px-4 text-xs disabled:opacity-60`}>
                      {savingEdit ? "در حال ذخیره..." : "ذخیره تغییرات"}
                    </button>
                    <button onClick={() => setEditingId(null)} className="flex h-10 items-center rounded-xl border border-neutral-200 px-4 text-xs font-bold text-neutral-600 transition hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
                      لغو
                    </button>
                  </div>
                </div>
              )}

              <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
                <div className="flex items-center justify-between text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                  <span>مصرف</span>
                  <span>{faInt(d.usedCount)} / {unlimited ? "∞" : faInt(limit)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div
                    className={`h-full rounded-full transition-all ${isExpired || !d.isActive ? "bg-neutral-300 dark:bg-neutral-700" : "bg-gradient-to-l from-pink-500 to-purple-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <span>انقضا: {d.expiresAt ? faDate(d.expiresAt) : <span className="text-neutral-400">ندارد</span>}</span>
                  <span>امکان استفاده: {unlimited ? "نامحدود" : `${faInt(remaining)} بار باقی‌مانده`}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}

/* ─── سالن‌های نمونهٔ صفحهٔ اصلی ───────────────────────────────────────── */

const SAMPLE_SLUGS_KEY = "home.sample_salons";

/**
 * ادمین تعیین می‌کند کدام سالن‌ها در بخش «سالن نمونه»ٔ صفحهٔ اصلی نمایش داده شوند و
 * به چه ترتیبی. خروجی به‌صورت فهرست اسلاگ‌ها (کاما جدا) در تنظیم `home.sample_salons`
 * ذخیره می‌شود؛ همان کلیدی که لودر `loadHome` می‌خواند. فقط سالن‌های تأیید و فعال
 * قابل انتخاب‌اند — چون لودرِ صفحهٔ اصلی هم همان‌ها را پیدا می‌کند. خالی‌گذاشتن،
 * پیش‌فرضِ «mah» را برمی‌گرداند.
 */
function SampleSalonsEditor({ ctx, salons }: { ctx: Ctx; salons: Salon[] }) {
  const [order, setOrder] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const eligible = useMemo(() => salons.filter((s) => s.isApproved && s.isActive), [salons]);
  const eligibleSet = useMemo(() => new Set(eligible.map((s) => s.slug)), [eligible]);
  const nameBySlug = useMemo(
    () => Object.fromEntries(eligible.map((s) => [s.slug, s.name])),
    [eligible]
  );

  // خواندن مقدار فعلی تنظیم (از کاتالوگ values؛ fallback به ردیف‌های دیتابیسی)
  useEffect(() => {
    let cancelled = false;
    ctx
      .api<
        ApiRes<{
          values?: { key: string; value: string }[];
          settings?: { key: string; value?: string | null }[];
        }>
      >("/api/admin/settings", "GET")
      .then((d) => {
        if (cancelled || !d) return;
        const raw =
          d.values?.find((v) => v.key === SAMPLE_SLUGS_KEY)?.value ??
          d.settings?.find((s) => s.key === SAMPLE_SLUGS_KEY)?.value ??
          "";
        const parsed = raw
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        // تنظیم ذخیره‌نشده/خالی = همان پیش‌فرضِ لودر (mah)
        setOrder(parsed.length ? parsed : ["mah"]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  // اگر سالنی از دسترس خارج شد (تعلیق/لغو تأیید/حذف)، از فهرست نمونه بیرونش کن
  useEffect(() => {
    if (!loaded) return;
    setOrder((prev) => {
      const kept = prev.filter((slug) => eligibleSet.has(slug));
      return kept.length === prev.length ? prev : kept;
    });
  }, [loaded, eligibleSet]);

  function toggleSlug(slug: string) {
    setDirty(true);
    setOrder((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  function move(slug: string, dir: -1 | 1) {
    setDirty(true);
    setOrder((prev) => {
      const i = prev.indexOf(slug);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function resetDefault() {
    setDirty(true);
    setOrder(["mah"].filter((s) => eligibleSet.has(s)));
  }

  async function save() {
    setSaving(true);
    const r = await ctx.api<ApiRes>(
      "/api/admin/settings",
      "PATCH",
      { updates: [{ key: SAMPLE_SLUGS_KEY, value: order.join(",") }] },
      "سالن‌های نمونه ذخیره شد ✅"
    );
    if (r) setDirty(false);
    setSaving(false);
  }

  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-neutral-900 dark:text-neutral-100">⭐ سالن‌های نمونهٔ صفحهٔ اصلی</h3>
          <p className="mt-1 text-xs leading-6 text-neutral-500 dark:text-neutral-400">
            مشخص کنید کدام سالن‌ها در بخش «سالن نمونه»ٔ صفحهٔ اصلی نمایش داده شوند و ترتیبشان چگونه باشد. فقط سالن‌های تأیید و فعال قابل انتخاب‌اند؛ خالی‌گذاشتن، پیش‌فرض «mah» را نشان می‌دهد.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={resetDefault} className={ghostBtn} disabled={saving || !loaded}>
            پیش‌فرض
          </button>
          <button type="button" onClick={save} className={primaryBtn} disabled={saving || !loaded || !dirty}>
            {saving ? "…" : "ذخیره ✅"}
          </button>
        </div>
      </div>

      {!loaded && <p className="text-[11px] text-neutral-400">در حال خواندن تنظیمات…</p>}

      {order.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {order.map((slug, i) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1 rounded-full bg-pink-50 px-2.5 py-1 text-[11px] font-bold text-pink-700 dark:bg-pink-950/40 dark:text-pink-300"
            >
              <span className="text-pink-400">{i + 1}</span>
              <span className="max-w-[12rem] truncate">{nameBySlug[slug] ?? slug}</span>
              <button type="button" onClick={() => move(slug, -1)} disabled={i === 0} className="px-0.5 hover:text-pink-900 disabled:opacity-30" title="انتقال به بالا">
                ↑
              </button>
              <button type="button" onClick={() => move(slug, 1)} disabled={i === order.length - 1} className="px-0.5 hover:text-pink-900 disabled:opacity-30" title="انتقال به پایین">
                ↓
              </button>
              <button type="button" onClick={() => toggleSlug(slug)} className="px-0.5 text-pink-400 hover:text-red-500" title="حذف از نمونه‌ها">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {eligible.length === 0 ? (
        loaded && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            هنوز سالن تأیید و فعالی وجود ندارد؛ ابتدا از فهرست پایین یک سالن را «تأیید» و «فعال» کنید تا اینجا قابل انتخاب شود.
          </p>
        )
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {eligible.map((s) => {
            const on = order.includes(s.slug);
            return (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                  on
                    ? "border-pink-300 bg-pink-50/70 dark:border-pink-800 dark:bg-pink-950/30"
                    : "border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700/50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => toggleSlug(s.slug)} className="h-4 w-4 shrink-0 accent-pink-600" />
                  <span className="truncate font-bold text-neutral-800 dark:text-neutral-100">{s.name}</span>
                </span>
                <span className="shrink-0 text-[10px] text-neutral-400" dir="ltr">
                  /{s.slug}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {loaded && dirty && (
        <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
          تغییرات هنوز ذخیره نشده — دکمهٔ «ذخیره» را بزنید.
        </p>
      )}
    </div>
  );
}

/* ─── مدیریت سالن‌ها ─────────────────────────────────────────────────── */

const SALONS_PAGE_SIZE = 25;

function SalonManagerList({ ctx, salons, refresh }: { ctx: Ctx; salons: Salon[]; refresh: () => void }) {
  const [detail, setDetail] = useState<SalonDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [igEditing, setIgEditing] = useState(false);
  const [igValue, setIgValue] = useState("");
  const [igSaving, setIgSaving] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending" | "inactive">("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"new" | "busy" | "name">("new");

  // صفحه‌بندی سمت سرور: GET /api/salons?page=&limit=&q=&sort=
  const [term, setTerm] = useState("");
  const [rows, setRows] = useState<Salon[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [version, setVersion] = useState(0);

  // جستجو با تأخیر (تایپ هر کاراکتر باعث درخواست اضافی به سرور نشود)
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (term) params.set("q", term);
      params.set("sort", sortBy);
      params.set("page", String(page));
      params.set("limit", String(SALONS_PAGE_SIZE));
      const r = await fetch(`/api/salons?${params}`);
      const d = await r.json();
      if (d.success) {
        setRows((d.salons as Salon[]) ?? []);
        setTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? Math.max(1, Math.ceil((d.total ?? 0) / SALONS_PAGE_SIZE)));
      } else ctx.setMsg({ ok: false, text: d.error || "خطا در دریافت سالن‌ها" });
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, sortBy, page]);

  useEffect(() => {
    void load();
  }, [load, version]);

  // تغییر جستجو یا مرتب‌سازی → بازنشانی صفحه به ۱
  useEffect(() => {
    setPage(1);
  }, [term, sortBy]);

  // فیلترهای وضعیت/پلن در سرور پشتیبانی نمی‌شوند؛ روی ردیف‌های همین صفحه اعمال می‌شوند
  const visible = useMemo(() => {
    return rows.filter((s) => {
      if (statusFilter === "approved" && !s.isApproved) return false;
      if (statusFilter === "pending" && s.isApproved) return false;
      if (statusFilter === "inactive" && s.isActive) return false;
      if (planFilter !== "all" && (s.plan ?? "FREE") !== planFilter) return false;
      return true;
    });
  }, [rows, statusFilter, planFilter]);

  /** هنجارسازی ورودی کاربر به URL کامل اینستاگرام (همان فرمتی که صفحهٔ عمومی انتظار دارد) */
  function normalizeInstagram(raw: string): string | null {
    const v = raw.trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    const bare = v.replace(/^@+/, "").replace(/^www\./i, "");
    if (/^instagram\.com\//i.test(bare)) return `https://${bare}`;
    if (bare && !bare.includes("/")) return `https://instagram.com/${bare}`;
    return `https://${bare}`;
  }

  async function saveInstagram(value: string | null) {
    if (!detail) return;
    setIgSaving(true);
    const r = await ctx.api<{ success: boolean; salon?: { instagram?: string | null } }>(
      `/api/admin/salons/${detail.id}`,
      "PATCH",
      { instagram: value },
      value ? "لینک اینستاگرام ذخیره شد ✅" : "لینک اینستاگرام حذف شد"
    );
    if (r) {
      setDetail({ ...detail, instagram: r.salon?.instagram ?? value });
      refresh();
      setVersion((v) => v + 1);
    }
    setIgEditing(false);
    setIgSaving(false);
  }

  async function open(salonId: string) {
    setLoading(true);
    setIgEditing(false);
    setIgValue("");
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
    if (r) {
      refresh();
      setVersion((v) => v + 1);
    }
  }

  return (
    <div className="space-y-2">
      <SampleSalonsEditor ctx={ctx} salons={salons} />
      {loading && <p className="py-4 text-center text-sm text-neutral-400">در حال دریافت جزئیات...</p>}
      {detail && (
        <div className="rounded-2xl border border-pink-200 bg-pink-50/60 p-4 dark:border-pink-800 dark:bg-pink-950/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">{detail.name}</h4>
              <div className="mt-0.5 text-xs text-neutral-500" dir="ltr">/{detail.slug}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${detail.isApproved ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                  {detail.isApproved ? "تأیید‌شده" : "در انتظار تأیید"}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${detail.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"}`}>
                  {detail.isActive ? "فعال" : "غیرفعال"}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${planBadgeCls(detail.plan)}`}>💠 {planLabel(detail.plan)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${domainBadgeCls(detail.domainStatus)}`}>🌐 {domainLabel(detail.domainStatus)}</span>
                {detail.publicUrl && (
                  <a href={detail.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-pink-600 shadow-sm hover:underline dark:bg-neutral-800">
                    🌐 صفحه عمومی ↗
                  </a>
                )}
              </div>
            </div>
            <button onClick={() => setDetail(null)} className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-neutral-600 shadow-sm dark:bg-neutral-800 dark:text-neutral-300">بستن ✕</button>
          </div>

          {/* اطلاعات تماس، موقعیت، برندینگ، دامنه و قوانین رزرو */}
          <div className="mt-3 space-y-3">
            {/* مالک و راه‌های ارتباطی */}
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">👤 مالک و راه‌های ارتباطی</div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <Info label="مالک" value={detail.owner?.name} />
                <Info label="تماس مالک" value={detail.owner?.phone} dir="ltr" />
                <Info label="تلفن سالن" value={detail.phone} dir="ltr" />
                <Info label="ایمیل" value={detail.email} dir="ltr" />
                <Info label="واتساپ" value={detail.whatsapp} dir="ltr" />
                <Info label="وب‌سایت" value={detail.website} href={detail.website ? (/^https?:/i.test(detail.website) ? detail.website : `https://${detail.website}`) : undefined} />
                <Info label="اینستاگرام" value={detail.instagram} href={detail.instagram ? (/^https?:/i.test(detail.instagram) ? detail.instagram : `https://${detail.instagram}`) : undefined} />
                <Info label="منطقهٔ زمانی" value={detail.timezone} dir="ltr" />
              </div>
            </div>

            {/* موقعیت */}
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">📍 موقعیت</div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                <Info label="شهر" value={detail.city} />
                <div className="rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs dark:bg-neutral-900/40">
                  <span className="text-neutral-400">نشانی:</span> <span className="font-bold text-neutral-800 dark:text-neutral-100">{detail.address || "—"}</span>
                </div>
                <Info label="عرض/طول جغرافیایی" value={detail.latitude != null && detail.longitude != null ? `${detail.latitude}, ${detail.longitude}` : null} href={detail.latitude != null && detail.longitude != null ? `https://maps.google.com/?q=${detail.latitude},${detail.longitude}` : undefined} />
                <Info label="لینک نقشه" value={detail.mapUrl ? "باز کردن ↗" : null} href={detail.mapUrl ?? undefined} />
                <Info label="نشان" value={detail.neshanUrl ? "باز کردن ↗" : null} href={detail.neshanUrl ?? undefined} />
                <Info label="بلد" value={detail.baladUrl ? "باز کردن ↗" : null} href={detail.baladUrl ?? undefined} />
              </div>
            </div>

            {/* برندینگ و دامنه */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
                <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">🎨 برندینگ</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-700">
                    {detail.logoUrl ? <img src={detail.logoUrl} alt="لوگو" className="h-full w-full object-cover" /> : <span className="text-lg">🖼️</span>}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 text-[11px] text-neutral-600 dark:text-neutral-300">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block h-4 w-4 shrink-0 rounded-full border" style={{ backgroundColor: detail.coverColor ?? "#ec4899" }} />
                      <span>رنگ: <b dir="ltr">{detail.coverColor ?? "—"}</b></span>
                    </div>
                    <div>بنر: {detail.bannerUrl ? <a href={detail.bannerUrl} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline dark:text-pink-400">مشاهده ↗</a> : "—"}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
                <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">🌐 دامنهٔ اختصاصی</div>
                <div className="mt-2 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2"><span className="text-neutral-400">دامنه</span><span className="truncate font-bold text-neutral-800 dark:text-neutral-100" dir="ltr">{detail.customDomain || "تنظیم نشده"}</span></div>
                  <div className="flex items-center justify-between gap-2"><span className="text-neutral-400">وضعیت</span><span className={`rounded-full px-2 py-0.5 font-bold ${domainBadgeCls(detail.domainStatus)}`}>{domainLabel(detail.domainStatus)}</span></div>
                  {detail.publicUrl && <a href={detail.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-block truncate text-pink-600 hover:underline dark:text-pink-400" dir="ltr">{detail.publicUrl} ↗</a>}
                </div>
              </div>
            </div>

            {/* پلن/اشتراک و قوانین رزرو */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
                <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">💠 پلن و اشتراک</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Info label="پلن" value={planLabel(detail.plan)} />
                  <Info label="نوسازی خودکار" value={detail.autoRenew ? "روشن" : "خاموش"} />
                  <Info label="پایان اشتراک" value={faDate(detail.subscriptionEndsAt)} />
                  <Info label="پایان آزمایشی" value={faDate(detail.trialEndsAt)} />
                </div>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
                <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">⏱️ قوانین رزرو</div>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Info label="حداقل اطلاع" value={detail.minNoticeMinutes != null ? `${faInt(detail.minNoticeMinutes)} دقیقه` : "—"} />
                  <Info label="حداکثر روز" value={detail.maxAdvanceDays != null ? `${faInt(detail.maxAdvanceDays)} روز` : "—"} />
                  <Info label="مهلت لغو" value={detail.cancelDeadlineHours != null ? `${faInt(detail.cancelDeadlineHours)} ساعت` : "—"} />
                  <Info label="فاصلهٔ نوبت" value={detail.bufferMinutes != null ? `${faInt(detail.bufferMinutes)} دقیقه` : "—"} />
                </div>
              </div>
            </div>

            {/* وضعیت و زمان‌ها */}
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <Info label="تأیید" value={detail.isApproved ? "تأییدشده" : "در انتظار"} />
                <Info label="فعالیت" value={detail.isActive ? "فعال" : "غیرفعال"} />
                <Info label="تاریخ ایجاد" value={faDate(detail.createdAt)} />
                <Info label="آخرین ویرایش" value={faDateTime(detail.updatedAt)} />
              </div>
            </div>
          </div>

          {/* تنظیم پویای لینک اینستاگرام همین سالن */}
          <div className="mt-3 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">📷 لینک اینستاگرام سالن</div>
              {!igEditing && (
                <button
                  onClick={() => {
                    setIgValue(detail.instagram ?? "");
                    setIgEditing(true);
                  }}
                  className={detail.instagram ? ghostBtn : okBtn}
                >
                  {detail.instagram ? "✏️ ویرایش لینک" : "➕ افزودن لینک اینستاگرام"}
                </button>
              )}
            </div>
            {detail.instagram && !igEditing ? (
              <a
                href={detail.instagram}
                target="_blank"
                rel="noopener noreferrer"
                dir="ltr"
                className="mt-1.5 block truncate text-xs text-pink-600 underline-offset-2 hover:underline dark:text-pink-400"
              >
                {detail.instagram}
              </a>
            ) : null}
            {!detail.instagram && !igEditing ? (
              <p className="mt-1 text-[11px] text-neutral-400">تنظیم نشده — با افزودن لینک، دکمهٔ اینستاگرام در صفحهٔ عمومی سالن ظاهر می‌شود.</p>
            ) : null}
            {igEditing && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  className={`${input} flex-1 text-xs`}
                  dir="ltr"
                  placeholder="instagram.com/mysalon یا @mysalon"
                  value={igValue}
                  onChange={(e) => setIgValue(e.target.value)}
                  disabled={igSaving}
                  autoFocus
                />
                <button onClick={() => saveInstagram(normalizeInstagram(igValue))} disabled={igSaving} className={okBtn}>
                  {igSaving ? "…" : "ذخیره ✅"}
                </button>
                <button onClick={() => setIgEditing(false)} disabled={igSaving} className={ghostBtn}>انصراف</button>
                {detail.instagram && (
                  <button onClick={() => saveInstagram(null)} disabled={igSaving} className={dangerBtn}>حذف لینک</button>
                )}
              </div>
            )}
          </div>

          {/* آمار جامع */}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ["نوبت‌ها", String(detail._count.appointments)],
              ["مشتریان", String(detail._count.customers ?? 0)],
              ["کارکنان", String(detail._count.staff)],
              ["خدمات", String(detail._count.services)],
              ["شعبه‌ها", String(detail._count.branches)],
              ["گالری", String(detail._count.galleryItems ?? 0)],
              ["نظرات", String(detail._count.reviews)],
              ["سفارش‌ها", String(detail._count.orders)],
              ["فاکتور", String(detail._count.invoices ?? 0)],
              ["کمپین", String(detail._count.campaigns ?? 0)],
              ["صف انتظار", String(detail._count.waitlist ?? 0)],
              ["علاقه‌مندی", String(detail._count.favorites ?? 0)],
              ["تماس صوتی", String(detail._count.voiceCalls ?? 0)],
              ["ثبت صندوق", String(detail._count.cashEntries ?? 0)],
              ["تعطیلات", String(detail._count.holidays ?? 0)],
              ["بلوک زمانی", String(detail._count.timeBlocks ?? 0)],
              ["وب‌هوک", String(detail._count.webhooks ?? 0)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-white px-2.5 py-2 text-center shadow-sm dark:bg-neutral-800">
                <div className="text-sm font-black text-neutral-900 dark:text-neutral-100">{v}</div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{l}</div>
              </div>
            ))}
            <div className="rounded-xl bg-emerald-50 px-2.5 py-2 text-center shadow-sm dark:bg-emerald-950/30">
              <div className="text-sm font-black text-emerald-700 dark:text-emerald-300">{(detail.paidRevenue ?? 0).toLocaleString("fa-IR")}</div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400">درآمد پرداخت‌شده</div>
            </div>
            <div className="rounded-xl bg-amber-50 px-2.5 py-2 text-center shadow-sm dark:bg-amber-950/30">
              <div className="text-sm font-black text-amber-700 dark:text-amber-300">{(detail.outstandingAmount ?? 0).toLocaleString("fa-IR")}</div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400">معوق ({detail.outstandingCount ?? 0})</div>
            </div>
          </div>

          {/* وضعیت نوبت‌ها */}
          {detail.appointmentsByStatus && Object.keys(detail.appointmentsByStatus).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.entries(detail.appointmentsByStatus).map(([k, v]) => (
                <span key={k} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-700 shadow-sm dark:bg-neutral-800 dark:text-neutral-200">
                  {k}: {v}
                </span>
              ))}
            </div>
          )}

          {/* اشتراک */}
          {detail.subscription && (
            <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs shadow-sm dark:bg-neutral-800">
              اشتراک: <b className="text-neutral-800 dark:text-neutral-100">{detail.subscription.name ?? detail.subscription.plan}</b>
              {(detail.subscription.price ?? 0) > 0 && <> — {(detail.subscription.price!).toLocaleString("fa-IR")} تومان</>}
              {" "}تا {new Date(detail.subscription.endsAt).toLocaleDateString("fa-IR")}
              {detail.subscription.period ? ` (${detail.subscription.period})` : ""}
            </div>
          )}

          {/* کارکنان و خدمات */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">کارکنان ({detail._count.staff})</div>
              <div className="mt-1.5 space-y-1">
                {(detail.staffList ?? []).slice(0, 6).map((st) => (
                  <div key={st.id} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-700 dark:text-neutral-200">{st.name}</span>
                    <span className="text-neutral-400">{st.title ?? "—"}</span>
                  </div>
                ))}
                {(detail.staffList ?? []).length === 0 && <p className="text-xs text-neutral-400">کارمندی ثبت نشده است.</p>}
              </div>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">خدمات ({detail._count.services})</div>
              <div className="mt-1.5 space-y-1">
                {(detail.services ?? []).slice(0, 6).map((sv) => (
                  <div key={sv.id} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-700 dark:text-neutral-200">{sv.name}</span>
                    <span className="text-neutral-400">{sv.price.toLocaleString("fa-IR")} ت</span>
                  </div>
                ))}
                {(detail.services ?? []).length === 0 && <p className="text-xs text-neutral-400">خدمتی ثبت نشده است.</p>}
              </div>
            </div>
          </div>

          {/* کمپین فعال و آخرین فاکتور */}
          {(detail.activeCampaigns?.length ?? 0) > 0 || detail.latestInvoice ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(detail.activeCampaigns?.length ?? 0) > 0 && (
                <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
                  <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">کمپین‌های فعال</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {detail.activeCampaigns!.map((c) => (
                      <span key={c.id} className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        {c.name} ({c.status})
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {detail.latestInvoice && (
                <div className="rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
                  <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">آخرین فاکتور</div>
                  <div className="mt-1 text-xs text-neutral-700 dark:text-neutral-200">
                    {detail.latestInvoice.number} — {detail.latestInvoice.amount.toLocaleString("fa-IR")} ت
                    <span className="text-neutral-400"> ({detail.latestInvoice.status})</span>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* مشتریان اخیر */}
          {(detail.recentCustomers?.length ?? 0) > 0 && (
            <div className="mt-3 rounded-xl bg-white p-3 shadow-sm dark:bg-neutral-800">
              <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">مشتریان اخیر</div>
              <div className="mt-1.5 space-y-1">
                {detail.recentCustomers!.slice(0, 5).map((cu, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-700 dark:text-neutral-200">
                      {[cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.name || "مشتری"} <span className="text-neutral-400" dir="ltr">{cu.phone}</span>
                    </span>
                    <span className="text-neutral-400">{cu.visits} بازدید · {cu.spend.toLocaleString("fa-IR")} ت</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* نوبت‌های اخیر */}
          <div className="mt-3 space-y-1">
            <div className="text-xs font-bold text-neutral-600 dark:text-neutral-300">آخرین نوبت‌ها</div>
            {(detail.recentAppointments ?? []).slice(0, 6).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-1.5 text-xs shadow-sm dark:bg-neutral-800">
                <span className="text-neutral-800 dark:text-neutral-100">{a.customerName}{a.service ? ` — ${a.service.name}` : ""}</span>
                <span className="text-neutral-500 dark:text-neutral-400">{new Date(a.startAt).toLocaleString("fa-IR")} — {a.status}</span>
              </div>
            ))}
            {(detail.recentAppointments ?? []).length === 0 && <p className="text-xs text-neutral-400">نوبتی ثبت نشده است.</p>}
          </div>
        </div>
      )}
      {/* نوار ابزار فهرست سالن‌ها */}
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        <input
          className={`${input} min-w-[10rem] flex-1 text-xs`}
          placeholder="جستجو: نام، اسلاگ یا تلفن مالک…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="جستجوی سالن"
        />
        <select className={`${input} w-auto text-xs`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="فیلتر وضعیت">
          <option value="all">همهٔ وضعیت‌ها</option>
          <option value="approved">تأییدشده</option>
          <option value="pending">در انتظار تأیید</option>
          <option value="inactive">غیرفعال</option>
        </select>
        <select className={`${input} w-auto text-xs`} value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} aria-label="فیلتر پلن">
          <option value="all">همهٔ پلن‌ها</option>
          <option value="FREE">رایگان</option>
          <option value="BASIC">پایه</option>
          <option value="PRO">حرفه‌ای</option>
          <option value="ENTERPRISE">سازمانی</option>
        </select>
        <select className={`${input} w-auto text-xs`} value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="مرتب‌سازی">
          <option value="new">جدیدترین</option>
          <option value="busy">پرنوبت‌ترین</option>
          <option value="name">نام (الفبایی)</option>
        </select>
        <span className="shrink-0 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
          {visible.length.toLocaleString("fa-IR")} از {total.toLocaleString("fa-IR")} سالن
        </span>
      </div>
      {visible.length === 0 && (
        <p className="py-8 text-center text-neutral-400 dark:text-neutral-500">
          {total === 0 ? "سالنی یافت نشد." : "هیچ سالنی با این جستجو/فیلترها مطابقت ندارد."}
        </p>
      )}
      {visible.map((s) => (
        <div key={s.id} className={`${listRow} flex flex-wrap items-center justify-between gap-2`}>
          <button onClick={() => open(s.id)} className="min-w-0 flex-1 text-right">
            <div className="flex items-center gap-2">
              <span className="truncate font-bold text-neutral-800 dark:text-neutral-100">{s.name}</span>
              <span className="shrink-0 text-xs text-neutral-400" dir="ltr">/{s.slug}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span dir="ltr">{s.owner?.phone ?? "—"}</span>
              {s.city && <span>📍 {s.city}</span>}
              <span>🗓️ {(s._count?.appointments ?? 0).toLocaleString("fa-IR")} نوبت</span>
              {s.createdAt && <span>🆕 {faDate(s.createdAt)}</span>}
            </div>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const dl = daysLeft(s.subscriptionEndsAt ?? s.trialEndsAt);
              if (dl == null) return null;
              const label = s.subscriptionEndsAt ? "اشتراک" : "آزمایشی";
              if (dl < 0) return <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:bg-red-900/40 dark:text-red-400">⚠️ {label} منقضی</span>;
              if (dl <= 7) return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">⏳ {label} {dl.toLocaleString("fa-IR")} روز</span>;
              return null;
            })()}
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${planBadgeCls(s.plan)}`}>💠 {planLabel(s.plan)}</span>
            {s.domainStatus && s.domainStatus !== "NONE" && (
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${domainBadgeCls(s.domainStatus)}`}>🌐 {s.domainStatus === "VERIFIED" ? "دامنه ✓" : "دامنه…"}</span>
            )}
            <button
              onClick={() => open(s.id)}
              title={s.instagram ? "ویرایش لینک اینستاگرام" : "تنظیم لینک اینستاگرام"}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                s.instagram
                  ? "bg-pink-50 text-pink-600 hover:bg-pink-100 dark:bg-pink-950/40 dark:text-pink-300"
                  : "bg-neutral-100 text-neutral-400 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-500"
              }`}
            >
              📷 {s.instagram ? "اینستا فعال" : "اینستا ✚"}
            </button>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.isApproved ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
              {s.isApproved ? "تأیید‌شده" : "در انتظار"}
            </span>
            <button onClick={() => open(s.id)} className={ghostBtn}>جزئیات</button>
            <button onClick={() => toggle(s, "isApproved")} className={ghostBtn}>{s.isApproved ? "لغو تأیید" : "تأیید"}</button>
            <button onClick={() => toggle(s, "isActive")} className={s.isActive ? dangerBtn : okBtn}>{s.isActive ? "تعلیق" : "فعال‌سازی"}</button>
          </div>
        </div>
      ))}

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/reviews?page=${page}&limit=25`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setReviews(d.reviews as Review[]);
          setTotal(d.total ?? 0);
          setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [page]);

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
      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}

/* ─── درخواست‌های تسویه ──────────────────────────────────────────────── */

const PAYOUT_STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: "در انتظار", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  PROCESSING: { label: "در حال واریز", cls: "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  PAID: { label: "واریز شد", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  REJECTED: { label: "رد شد (وجه برگشت)", cls: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" },
};

const PAYOUT_METHOD: Record<string, string> = {
  BANK: "کارت به کارت / سات",
  CARD: "شبا کارت",
  SMS: "به‌صورت اعتبار پیامکی",
};

const payoutBadge = (s?: string | null) => {
  const m = PAYOUT_STATUS[s ?? ""] ?? { label: s ?? "—", cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${m.cls}`}>{m.label}</span>;
};

function PayoutManager({ ctx }: { ctx: Ctx }) {
  const PAGE_SIZE = 25;
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/payouts?page=${page}&limit=${PAGE_SIZE}${status ? `&status=${status}` : ""}`);
        const d = await r.json();
        if (cancelled || !d.success) return;
        setPayouts(d.payouts as Payout[]);
        setTotal(d.total ?? 0);
        setTotalPages(Math.max(1, Number(d.totalPages ?? 1)));
        setPendingTotal(d.pendingTotal ?? 0);
        setPendingCount(d.pendingCount ?? 0);
      } catch {
        /* خطای شبکه از طریق msg مدیریت می‌شود */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, status, reload]);

  async function setPayoutStatus(id: string, next: string) {
    setBusy(id);
    const ok = next === "PAID" ? "تسویه پرداخت شد ✅" : next === "REJECTED" ? "درخواست رد و وجه به کیف پول برگشت ✅" : undefined;
    await ctx.api(`/api/admin/payouts/${id}`, "PATCH", { status: next }, ok);
    setReload((n) => n + 1);
    setBusy(null);
  }

  const filters: { key: string; label: string }[] = [
    { key: "", label: "همه" },
    { key: "REQUESTED", label: "در انتظار" },
    { key: "PROCESSING", label: "در حال واریز" },
    { key: "PAID", label: "واریز شد" },
    { key: "REJECTED", label: "رد شده" },
  ];

  return (
    <div className="space-y-3">
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div className="text-sm text-neutral-600 dark:text-neutral-300">
          {pendingCount > 0 ? (
            <>
              <b className="text-neutral-900 dark:text-neutral-100">{faInt(pendingCount)}</b> درخواست در انتظار بررسی به مجموع{" "}
              <b className="text-neutral-900 dark:text-neutral-100">{faInt(pendingTotal)} تومان</b>
            </>
          ) : (
            "درخواست تسویه‌ای در انتظار بررسی نیست."
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key || "all"}
              onClick={() => {
                setStatus(f.key);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                status === f.key
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {payouts.length === 0 && <p className="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">درخواست تسویه‌ای ثبت نشده است.</p>}

      {payouts.map((p) => (
        <div key={p.id} className={`${listRow} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-black text-neutral-900 dark:text-neutral-100">{faInt(p.amount)} تومان</span>
              {payoutBadge(p.status)}
            </div>
            <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {p.owner?.name ?? "مالک"} — {p.owner?.phone ?? "—"} · {PAYOUT_METHOD[p.method] ?? p.method} · درخواست: {faDateTime(p.requestedAt)}
              {p.processedAt ? ` · آخرین تغییر: ${faDateTime(p.processedAt)}` : ""}
            </div>
            {p.bankInfo && <div className="mt-1 break-all text-xs text-neutral-600 dark:text-neutral-300" dir="ltr">{p.bankInfo}</div>}
            <div className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">موجودی فعلی کیف پول: {faInt(p.walletBalance)} تومان</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(p.status === "REQUESTED" || p.status === "PROCESSING") && (
              <>
                <button disabled={busy === p.id} onClick={() => setPayoutStatus(p.id, "PROCESSING")} className={ghostBtn}>
                  در حال واریز
                </button>
                <button disabled={busy === p.id} onClick={() => setPayoutStatus(p.id, "PAID")} className={okBtn}>
                  پرداخت شد
                </button>
                <button disabled={busy === p.id} onClick={() => setPayoutStatus(p.id, "REJECTED")} className={dangerBtn}>
                  رد و بازگشت وجه
                </button>
              </>
            )}
          </div>
        </div>
      ))}

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}

/* ─── لاگ فعالیت‌ها ──────────────────────────────────────────────────── */

/* ─── فراداده اقدام‌های حسابرسی ──────────────────────────────────────── */

type AuditActionMeta = { label: string; icon: string; grad: string; desc: string };

const ACTION_META: Record<string, AuditActionMeta> = {
  approve_salon: { label: "تأیید سالن", icon: "✅", grad: "from-emerald-500 to-teal-500", desc: "تأیید و فعال‌سازی یک سالن جدید پس از بررسی اطلاعات آن." },
  change_salon_status: { label: "تغییر وضعیت سالن", icon: "🔄", grad: "from-sky-500 to-blue-500", desc: "تغییر وضعیت تأیید یا فعال بودن یک سالن." },
  update_salon_instagram: { label: "ویرایش اینستاگرام سالن", icon: "📸", grad: "from-pink-500 to-rose-500", desc: "ویرایش آیدی اینستاگرام یک سالن توسط ادمین." },
  suspend_salon: { label: "تعلیق سالن", icon: "⛔", grad: "from-amber-500 to-orange-500", desc: "تعلیق موقت یک سالن و خروج آن از دسترس کاربران." },
  create_discount: { label: "ساخت کد تخفیف", icon: "🏷️", grad: "from-purple-500 to-violet-500", desc: "ساخت یک کد تخفیف جدید در سیستم." },
  update_discount: { label: "ویرایش کد تخفیف", icon: "✏️", grad: "from-purple-500 to-violet-500", desc: "ویرایش مشخصات یک کد تخفیف (درصد، سقف استفاده و...)." },
  delete_discount: { label: "حذف کد تخفیف", icon: "🗑️", grad: "from-red-500 to-rose-600", desc: "حذف دائمی یک کد تخفیف." },
  broadcast: { label: "پخش پیامک سراسری", icon: "📣", grad: "from-amber-500 to-orange-500", desc: "ارسال پیامک سراسری به گروهی از کاربران." },
  delete_review: { label: "حذف نظر", icon: "💬", grad: "from-pink-500 to-rose-500", desc: "حذف نظری که توسط یک مشتری ثبت شده است." },
  notification_retry: { label: "تلاش دوباره اعلان", icon: "🔔", grad: "from-sky-500 to-blue-500", desc: "تلاش دوباره برای ارسال یک اعلان ناموفق." },
  update_user: { label: "ویرایش کاربر", icon: "👤", grad: "from-indigo-500 to-blue-500", desc: "ویرایش نقش یا وضعیت حساب یک کاربر." },
  support_ticket_update: { label: "به‌روزرسانی تیکت", icon: "🎫", grad: "from-teal-500 to-emerald-500", desc: "به‌روزرسانی وضعیت یک تیکت پشتیبانی." },
  create_package: { label: "ساخت پکیج", icon: "📦", grad: "from-purple-500 to-violet-500", desc: "تعریف یک بسته اشتراک جدید." },
  update_package: { label: "ویرایش پکیج", icon: "✏️", grad: "from-purple-500 to-violet-500", desc: "ویرایش مشخصات یک بسته اشتراک." },
  delete_package: { label: "حذف پکیج", icon: "🗑️", grad: "from-red-500 to-rose-600", desc: "حذف یک بسته اشتراک از سیستم." },
  deactivate_package: { label: "غیرفعال‌سازی پکیج", icon: "🚫", grad: "from-amber-500 to-orange-500", desc: "خاموش کردن یک بسته اشتراک بدون حذف آن." },
  force_delete_package: { label: "حذف اجباری پکیج", icon: "⚠️", grad: "from-red-500 to-rose-600", desc: "حذف اجباری بسته‌ای که مشترک فعال دارد." },
  update_plan_limits: { label: "تغییر محدودیت‌های پلن", icon: "⚙️", grad: "from-slate-500 to-neutral-600", desc: "تغییر سقف محدودیت‌های هر پلن اشتراک." },
  settings_update: { label: "به‌روزرسانی تنظیمات", icon: "⚙️", grad: "from-slate-500 to-neutral-600", desc: "تغییر تنظیمات سیستمی مهم." },
  payout_update: { label: "رسیدگی به تسویه", icon: "💸", grad: "from-emerald-500 to-teal-500", desc: "تأیید، ثبت در حال واریز، یا رد یک درخواست تسویه و بازگشت وجه به کیف پول." },
};

const ENTITY_LABEL: Record<string, string> = {
  Salon: "سالن",
  User: "کاربر",
  Discount: "کد تخفیف",
  Review: "نظر",
  Package: "پکیج",
  System: "سیستم",
  Setting: "تنظیمات",
  Payout: "درخواست تسویه",
};

const ENTITY_ICON: Record<string, string> = {
  Salon: "✂️",
  User: "👤",
  Discount: "🏷️",
  Review: "💬",
  Package: "📦",
  System: "🖥️",
  Setting: "⚙️",
};

const DEFAULT_ACTION_META: AuditActionMeta = { label: "", icon: "🛡️", grad: "from-neutral-500 to-neutral-600", desc: "" };

function auditMeta(action: string): AuditActionMeta {
  return ACTION_META[action] ?? { ...DEFAULT_ACTION_META, label: action.replace(/_/g, " ") };
}
const auditLabel = (a: string) => auditMeta(a).label;
const auditIcon = (a: string) => auditMeta(a).icon;
const auditGrad = (a: string) => auditMeta(a).grad;
const auditDesc = (a: string) => auditMeta(a).desc;
const entityLabel = (e: string) => ENTITY_LABEL[e] ?? e;
const entityIcon = (e: string) => ENTITY_ICON[e] ?? "📄";

function DiffBadge({ label, value }: { label: string; value: unknown }) {
  const isObj = value != null && typeof value === "object";
  const txt = isObj ? JSON.stringify(value, null, 2) : String(value ?? "—");
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11px] font-black tracking-wide text-neutral-400 dark:text-neutral-500">{label}</div>
      <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-[11px] leading-relaxed text-neutral-700 shadow-sm dark:bg-neutral-800 dark:text-neutral-300">{txt}</pre>
    </div>
  );
}

function AuditView({ ctx }: { ctx: Ctx }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const actionOptions = useMemo(() => {
    const s = new Set(Object.keys(ACTION_META));
    logs.forEach((l) => s.add(l.action));
    return Array.from(s).sort();
  }, [logs]);

  const entityOptions = useMemo(() => {
    const s = new Set<string>();
    Object.keys(ENTITY_LABEL).forEach((k) => s.add(k));
    logs.forEach((l) => s.add(l.entityType));
    return Array.from(s).sort();
  }, [logs]);

  const visible = useMemo(() => {
    const sq = q.trim().toLowerCase();
    const base = !sq
      ? logs
      : logs.filter(
          (l) =>
            auditLabel(l.action).toLowerCase().includes(sq) ||
            l.action.toLowerCase().includes(sq) ||
            entityLabel(l.entityType).toLowerCase().includes(sq) ||
            l.entityType.toLowerCase().includes(sq) ||
            (l.actorPhone ?? "").toLowerCase().includes(sq)
        );
    return sort === "asc" ? [...base].reverse() : base;
  }, [logs, q, sort]);

  const summary = useMemo(() => {
    const actors = new Set<string>();
    const entities = new Set<string>();
    const today = new Date().toDateString();
    let todayCount = 0;
    visible.forEach((l) => {
      if (l.actorPhone) actors.add(l.actorPhone);
      entities.add(l.entityType);
      if (new Date(l.createdAt).toDateString() === today) todayCount += 1;
    });
    return { total: visible.length, actors: actors.size, entities: entities.size, today: todayCount };
  }, [visible]);

  const byEntity = useMemo(() => {
    const m = new Map<string, number>();
    visible.forEach((l) => m.set(l.entityType, (m.get(l.entityType) ?? 0) + 1));
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [visible]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      if (action) params.set("action", action);
      if (entity) params.set("entity", entity);
      params.set("page", String(page));
      params.set("limit", "25");
      const r = await fetch(`/api/admin/audit?${params}`);
      const d = await r.json();
      if (d.success) {
        setLogs(d.logs as AuditLog[]);
        setTotal(d.total ?? 0);
        setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
      } else ctx.setMsg({ ok: false, text: d.error || "خطا" });
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [action, entity, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [action, entity]);

  const resetFilters = () => {
    setQ("");
    setAction("");
    setEntity("");
    setSort("desc");
    setPage(1);
  };

  const hasDetail = (a: AuditLog) =>
    a.before !== undefined || a.after !== undefined || Boolean(a.entityId || a.actorId || a.ip);

  async function copyReport() {
    const text = visible
      .map(
        (a) =>
          `${faDateTime(a.createdAt)} | ${auditLabel(a.action)} | ${entityLabel(a.entityType)} | ${a.actorPhone ?? "سیستم"} | ${a.entityId ? "شناسه: " + a.entityId : ""}`.trim()
      )
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      ctx.setMsg({ ok: true, text: "گزارش رویدادهای فعلی کپی شد ✅" });
    } catch {
      ctx.setMsg({ ok: false, text: "کپی در مرورگر شما مجاز نیست" });
    }
  }

  function downloadCsv() {
    const rows = [
      ["زمان", "اقدام", "توضیح اقدام", "موجیت", "اقدام‌کننده", "شناسه موجودیت"].join(","),
      ...visible.map((a) =>
        [
          `"${faDateTime(a.createdAt)}"`,
          `"${auditLabel(a.action)}"`,
          `"${auditDesc(a.action)}"`,
          `"${entityLabel(a.entityType)}"`,
          `"${a.actorPhone ?? "سیستم"}"`,
          a.entityId ? `"${a.entityId}"` : "",
        ].join(",")
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-report.csv";
    link.click();
    URL.revokeObjectURL(url);
    ctx.setMsg({ ok: true, text: "فایل CSV دانلود شد ✅" });
  }

  const statCards = [
    { label: "رویداد نمایش داده‌شده", value: faInt(summary.total), icon: "📋", grad: "from-pink-500 to-rose-500" },
    { label: "رویداد امروز", value: faInt(summary.today), icon: "🕒", grad: "from-emerald-500 to-teal-500" },
    { label: "اقدام‌کنندگان", value: faInt(summary.actors), icon: "👤", grad: "from-indigo-500 to-blue-500" },
    { label: "موجیت‌های درگیر", value: faInt(summary.entities), icon: "🧩", grad: "from-amber-500 to-orange-500" },
  ];

  return (
    <div className="space-y-4">
      {/* هدر بخش */}
      <div className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 text-xl text-white shadow-md shadow-pink-500/20">🛡️</div>
        <div>
          <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">لاگ حسابرسی</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            ثبت شفافِ تمام اقدامات انجام‌شده توسط مدیران سیستم؛ از تأیید سالن و مدیریت کاربران تا تغییر تنظیمات و ارسال پیامک. روی هر رویداد کلیک کنید تا جزئیات کامل آن را ببینید.
          </p>
        </div>
      </div>

      {/* خلاصه آماری */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((c) => (
          <div key={c.label} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className={`flex items-center justify-between bg-gradient-to-l ${c.grad} px-4 py-2.5`}>
              <span className="text-xs font-bold text-white/90">{c.label}</span>
              <span className="text-base">{c.icon}</span>
            </div>
            <div className="px-4 py-3 text-2xl font-black text-neutral-900 dark:text-neutral-100">{c.value}</div>
          </div>
        ))}
      </div>

      {/* توزیع بر اساس موجودیت */}
      {byEntity.length > 0 && (
        <div className={`${card} flex flex-wrap items-center gap-2`}>
          <span className="text-xs font-bold text-neutral-500 dark:text-neutral-400">توزیع رویدادها:</span>
          {byEntity.map(([e, n]) => (
            <span key={e} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {entityIcon(e)} {entityLabel(e)} · {faInt(n)}
            </span>
          ))}
        </div>
      )}

      {/* فیلترها */}
      <div className={`${card} flex flex-wrap items-end gap-3`}>
        <div className="min-w-[12rem] flex-[2]">
          <label className="mb-1 block text-xs font-bold text-neutral-500 dark:text-neutral-400">جستجوی آزاد</label>
          <div className="relative">
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">🔎</span>
            <input className={`${input} pr-9`} placeholder="اقدام، موجودیت یا شماره..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="جستجوی آزاد" />
          </div>
        </div>
        <div className="min-w-[11rem] flex-1">
          <label className="mb-1 block text-xs font-bold text-neutral-500 dark:text-neutral-400">اقدام</label>
          <select className={input} value={action} onChange={(e) => setAction(e.target.value)} aria-label="اقدام">
            <option value="">همه اقدام‌ها</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>{auditLabel(a)}</option>
            ))}
          </select>
        </div>
        <div className="min-w-[11rem] flex-1">
          <label className="mb-1 block text-xs font-bold text-neutral-500 dark:text-neutral-400">نوع موجودیت</label>
          <select className={input} value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="نوع موجودیت">
            <option value="">همه موجودیت‌ها</option>
            {entityOptions.map((e) => (
              <option key={e} value={e}>{entityLabel(e)}</option>
            ))}
          </select>
        </div>
        <button onClick={() => setSort(sort === "desc" ? "asc" : "desc")} className={ghostBtn} title="تغییر ترتیب زمانی">
          {sort === "desc" ? "جدیدترین ← قدیمی‌ترین" : "قدیمی‌ترین ← جدیدترین"}
        </button>
        <button onClick={resetFilters} className={ghostBtn}>پاک‌کردن فیلترها</button>
        <button onClick={() => void load()} disabled={busy} className={primaryBtn}>
          {busy ? "در حال بارگذاری..." : "بارگذاری مجدد"}
        </button>
      </div>

      {/* نوار ابزار گزارش */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{faInt(visible.length)} رویداد در نمایش فعلی</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={copyReport} className={okBtn}>کپی گزارش</button>
          <button onClick={downloadCsv} className={okBtn}>دانلود CSV</button>
        </div>
      </div>

      {/* فهرست رویدادها */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100 dark:bg-neutral-800" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <div className="text-3xl">🗂️</div>
          <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-500">رویدادی یافت نشد. فیلترها را تغییر دهید.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <div key={a.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <button
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className={`flex w-full items-start gap-3 px-4 py-3 text-right transition hover:bg-neutral-50 dark:hover:bg-neutral-800/60 ${hasDetail(a) ? "cursor-pointer" : ""}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${auditGrad(a.action)} text-base shadow-sm`}>{auditIcon(a.action)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">{auditLabel(a.action)}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">{entityIcon(a.entityType)} {entityLabel(a.entityType)}</span>
                  </span>
                  {a.entityName ? (
                    <span className="mt-1 flex items-center gap-1 text-xs font-black text-pink-700 dark:text-pink-300">
                      🎯 برای «{a.entityName}»
                    </span>
                  ) : a.entityId ? (
                    <span className="mt-1 block text-[11px] text-neutral-400 dark:text-neutral-500">شناسه: {a.entityId}</span>
                  ) : null}
                  {auditDesc(a.action) && <span className="mt-1 block text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{auditDesc(a.action)}</span>}
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                    <span className="flex items-center gap-1">
                      👤 <b className="font-bold text-neutral-600 dark:text-neutral-300">{a.actorName ?? a.actorPhone ?? "سیستم"}</b>
                    </span>
                    {a.actorName && a.actorPhone && a.actorName !== a.actorPhone && <span dir="ltr">({a.actorPhone})</span>}
                  </span>
                </span>
                <span className="shrink-0 text-left">
                  <span className="block text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">{faDateTime(a.createdAt)}</span>
                </span>
                {hasDetail(a) && (
                  <span className={`mt-1 shrink-0 text-neutral-300 transition-transform dark:text-neutral-600 ${expanded === a.id ? "rotate-180" : ""}`}>▾</span>
                )}
              </button>

              {expanded === a.id && hasDetail(a) && (
                <div className="rounded-b-2xl border-t border-neutral-100 bg-neutral-50/60 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
                  <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
                    {a.actorId && <span className="rounded-full bg-white px-2.5 py-1 font-bold text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">شناسه کاربر: {a.actorId}</span>}
                    {a.entityId && <span className="rounded-full bg-white px-2.5 py-1 font-bold text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">شناسه موجودیت: {a.entityId}</span>}
                    {a.ip && <span dir="ltr" className="rounded-full bg-white px-2.5 py-1 font-bold text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">{a.ip}</span>}
                  </div>
                  {(a.before !== undefined || a.after !== undefined) && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {a.before !== undefined && <DiffBadge label="قبل (Before)" value={a.before} />}
                      {a.after !== undefined && <DiffBadge label="بعد (After)" value={a.after} />}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
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

const SUB_STATUS: Record<string, { label: string; cls: string; desc: string }> = {
  ACTIVE: { label: "فعال", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", desc: "در حال استفاده؛ سالن از امکانات پلن بهره‌مند است." },
  SUSPENDED: { label: "تعلیق‌شده", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", desc: "به‌طور موقت غیرفعال؛ قابل لغو یا عودت." },
  CANCELLED: { label: "لغو‌شده", cls: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400", desc: "توسط مالک یا سوپرادمین لغو شده؛ ادامهٔ استفاده ندارد." },
  EXPIRED: { label: "منقضی", cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400", desc: "تاریخ پایان گذشته و اشتراک دیگر معتبر نیست." },
};
const PERIOD_LABEL: Record<string, string> = { MONTHLY: "ماهانه", YEARLY: "سالانه" };

function SubscriptionManager({ ctx }: { ctx: Ctx }) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ ACTIVE: 0, SUSPENDED: 0, CANCELLED: 0, EXPIRED: 0 });
  const [filter, setFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("status", filter);
    params.set("page", String(page));
    params.set("limit", "25");
    fetch(`/api/admin/subscriptions?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setSubs(d.subscriptions as Subscription[]);
          if (d.counts) setCounts(d.counts as Record<string, number>);
          setTotal(d.total ?? 0);
          setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [filter, page]);

  async function reload() {
    const params = new URLSearchParams();
    if (filter !== "ALL") params.set("status", filter);
    params.set("page", String(page));
    params.set("limit", "25");
    const r = await fetch(`/api/admin/subscriptions?${params}`);
    const d = await r.json();
    if (d.success) {
      setSubs(d.subscriptions as Subscription[]);
      if (d.counts) setCounts(d.counts as Record<string, number>);
      setTotal(d.total ?? 0);
      setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
    }
  }

  async function setStatus(s: Subscription, status: string) {
    setBusyId(s.id);
    const msg = status === "CANCELLED" ? "اشتراک لغو شد" : status === "SUSPENDED" ? "اشتراک به حالت تعلیق درآمد" : "وضعیت اشتراک به‌روزرسانی شد ✅";
    const r = await ctx.api("/api/admin/subscriptions", "PATCH", { subscriptionId: s.id, status }, msg);
    setBusyId(null);
    if (r) reload();
  }

  const countOf = (st: string) => counts[st] ?? 0;
  const now = Date.now();
  const daysLeft = (endsAt: string) => Math.ceil((new Date(endsAt).getTime() - now) / 864e5);

  const stat = (label: string, value: string, tone: string, sub: string) => (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${tone}`}>{label}</div>
      <div className="mt-2 text-2xl font-black text-neutral-900 dark:text-neutral-100">{value}</div>
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{sub}</div>
    </div>
  );

  const filterChip = (key: string, label: string, count: number) => (
    <button
      onClick={() => { setPage(1); setFilter(key); }}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition ${
        filter === key ? "bg-[#1c2434] text-white dark:bg-white dark:text-[#1c2434]" : "bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
      }`}
    >
      {label}
      <span className="rounded-full bg-black/10 px-1.5 text-[10px] dark:bg-white/15">{faInt(count)}</span>
    </button>
  );

  return (
    <div>
      {/* راهنما */}
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50 to-indigo-50 p-4 dark:border-sky-900/40 dark:from-sky-950/20 dark:to-indigo-950/20">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm dark:bg-neutral-800">💠</span>
          <div>
            <h3 className="text-sm font-black text-neutral-800 dark:text-neutral-100">اشتراک‌ها در نوبینو چیست؟</h3>
            <ul className="mt-2 space-y-1 text-xs leading-6 text-neutral-600 dark:text-neutral-300">
              <li>• هر سالن با تهیهٔ یک <b>پکیج اشتراک</b> از امکانات پلن (پایه/حرفه‌ای/سازمانی) استفاده می‌کند.</li>
              <li>• اشتراک می‌تواند <b>ماهانه یا سالانه</b> باشد و در صورت فعال‌بودن گزینهٔ «تمدید خودکار» به‌صورت خودکار تمدید می‌شود.</li>
              <li>• وضعیت‌ها: <b>فعال</b>، <b>تعلیق‌شده</b>، <b>لغو‌شده</b> و <b>منقضی</b> (پس از عبور از تاریخ پایان).</li>
              <li>• با «تعلیق» اشتراک موقتاً متوقف می‌شود؛ با «لغو» دیگر اعتبار ندارد.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* آمار */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
        {stat("کل اشتراک‌ها", faInt(total), "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300", "همه رکوردها")}
        {stat("فعال", faInt(countOf("ACTIVE")), "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", "در حال استفاده")}
        {stat("تعلیق", faInt(countOf("SUSPENDED")), "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", "توقف موقت")}
        {stat("لغو/منقضی", faInt(countOf("CANCELLED") + countOf("EXPIRED")), "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400", "بدون اعتبار")}
      </div>

      {/* فیلتر وضعیت */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {filterChip("ALL", "همه", total)}
        {filterChip("ACTIVE", "فعال", countOf("ACTIVE"))}
        {filterChip("SUSPENDED", "تعلیق", countOf("SUSPENDED"))}
        {filterChip("CANCELLED", "لغو شده", countOf("CANCELLED"))}
        {filterChip("EXPIRED", "منقضی", countOf("EXPIRED"))}
      </div>

      {/* لیست */}
      <div className="mt-4 space-y-3">
        {subs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 py-10 text-center dark:border-neutral-700">
            <div className="text-4xl">💠</div>
            <p className="mt-3 text-sm font-black text-neutral-600 dark:text-neutral-300">اشتراکی در این دسته وجود ندارد</p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">با تغییر فیلتر بالا یا ساخت پکیج و خرید سالن، اینجا پر می‌شود.</p>
          </div>
        )}

        {subs.map((s) => {
          const st = SUB_STATUS[s.status] ?? { label: s.status, cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400", desc: "" };
          const dl = daysLeft(s.endsAt);
          const periodLabel = PERIOD_LABEL[s.period] ?? s.period;
          const planLabel = s.package?.plan ? PLAN_LABEL[s.package.plan] ?? s.package.plan : null;
          const act = s.status === "ACTIVE";
          const susp = s.status === "SUSPENDED";
          return (
            <div key={s.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg text-white ${act ? "bg-gradient-to-br from-emerald-400 to-teal-500" : susp ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-neutral-400 to-neutral-500"}`}>💠</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-neutral-900 dark:text-neutral-100">{s.salon?.name ?? "سالن"}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      <span>{s.package?.name ?? "پکیج"}</span>
                      {planLabel && <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-950/40 dark:text-purple-300">{planLabel}</span>}
                      <span>· {periodLabel}</span>
                      {s.autoRenew && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-600 dark:bg-sky-950/40 dark:text-sky-300">تمدید خودکار</span>}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {act && (
                    <>
                      <button onClick={() => setStatus(s, "SUSPENDED")} disabled={busyId === s.id} className={`${ghostBtn} disabled:opacity-50`}>تعلیق</button>
                      <button onClick={() => setStatus(s, "CANCELLED")} disabled={busyId === s.id} className={`${dangerBtn} disabled:opacity-50`}>لغو</button>
                    </>
                  )}
                  {susp && (
                    <button onClick={() => setStatus(s, "CANCELLED")} disabled={busyId === s.id} className={`${dangerBtn} disabled:opacity-50`}>لغو</button>
                  )}
                </div>
              </div>

              <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <div className="text-[10px] text-neutral-400">شروع</div>
                    <div className="text-xs font-bold text-neutral-700 dark:text-neutral-200">{faDate(s.startsAt)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-400">پایان</div>
                    <div className="text-xs font-bold text-neutral-700 dark:text-neutral-200">{faDate(s.endsAt)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-400">مانده تا پایان</div>
                    <div className={`text-xs font-bold ${act && dl <= 7 ? "text-red-600" : act ? "text-emerald-600" : "text-neutral-400"}`}>
                      {act ? (dl >= 0 ? `${faInt(dl)} روز` : "امروز") : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-neutral-400">توضیح وضعیت</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-5">{st.desc}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}

/* ─── مدیریت کاربران ─────────────────────────────────────────────────── */

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: "مشتری",
  SALON_OWNER: "مالک سالن",
  AGENT: "نماینده",
  ADMIN: "سوپرادمین",
};
const ROLE_INFO: Record<string, { desc: string; cls: string }> = {
  CUSTOMER: { desc: "کاربر عادی پلتفرم؛ رزرو نوبت، خرید بسته، ثبت نظر و امتیاز وفاداری. ورود با کد پیامکی/ایمیل.", cls: "bg-gradient-to-br from-sky-400 to-blue-500" },
  SALON_OWNER: { desc: "مالک/مدیر سالن‌ها؛ دسترسی به داشبورد سالن، خدمات، کارکنان، مشتریان و بخش مالی سالن.", cls: "bg-gradient-to-br from-purple-400 to-violet-500" },
  AGENT: { desc: "نماینده فروش؛ فقط برای ارسال پیامک تبلیغاتی به مشتریان (بدون دسترسی به مدیریت سالن).", cls: "bg-gradient-to-br from-amber-400 to-orange-500" },
  ADMIN: { desc: "سوپرادمین پلتفرم؛ دسترسی کامل به این پنل، تنظیمات سراسری و مدیریت همه بخش‌ها.", cls: "bg-gradient-to-br from-rose-400 to-red-500" },
};
const ROLE_BADGE: Record<string, string> = {
  CUSTOMER: "bg-sky-50 text-sky-700 ring-sky-200/60 dark:bg-sky-900/40 dark:text-sky-300 dark:ring-sky-800",
  SALON_OWNER: "bg-purple-50 text-purple-700 ring-purple-200/60 dark:bg-purple-900/40 dark:text-purple-300 dark:ring-purple-800",
  AGENT: "bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800",
  ADMIN: "bg-red-50 text-red-600 ring-red-200/60 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-900",
};
const ROLE_AVATAR: Record<string, string> = {
  CUSTOMER: "bg-gradient-to-br from-sky-400 to-blue-500",
  SALON_OWNER: "bg-gradient-to-br from-purple-400 to-violet-500",
  AGENT: "bg-gradient-to-br from-amber-400 to-orange-500",
  ADMIN: "bg-gradient-to-br from-rose-400 to-red-500",
};
const ROLE_GLOW: Record<string, string> = {
  CUSTOMER: "bg-gradient-to-br from-sky-200 to-blue-300",
  SALON_OWNER: "bg-gradient-to-br from-purple-200 to-violet-300",
  AGENT: "bg-gradient-to-br from-amber-200 to-orange-300",
  ADMIN: "bg-gradient-to-br from-rose-200 to-red-300",
};

type AdminUser = UserRow & {
  createdAt?: string;
  verifiedAt?: string | null;
  wallets?: { balance?: number }[];
  _count?: { ownedSalons?: number; orders?: number };
};
type AdminUserCounts = { total: number; active: number; suspended: number; byRole: Record<string, number> };

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${ROLE_BADGE[role] ?? "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700"}`}>
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800">
      ✓ تأیید‌شده
    </span>
  );
}

function UserStatCard({ label, value, icon, glow }: { label: string; value: string; icon: string; glow: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900">
      <div className={`absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-[0.14] blur-3xl transition-opacity duration-300 group-hover:opacity-25 ${glow}`} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">{value}</div>
          <div className="mt-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</div>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg shadow-sm ${glow}`}>{icon}</span>
      </div>
    </div>
  );
}

function ActiveToggle({ on, busy, onChange }: { on: boolean; busy: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "تعلیق حساب کاربر" : "فعال‌سازی حساب کاربر"}
      disabled={busy}
      onClick={onChange}
      title={on ? "تعلیق حساب (ورود و دسترسی کاربر مسدود می‌شود)" : "فعال‌سازی حساب"}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all duration-300 ${on ? "left-0.5" : "left-6"}`} />
      <span className="sr-only">{on ? "فعال" : "تعلیق"}</span>
    </button>
  );
}

function HelpBanner() {
  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/60 dark:bg-sky-950/30">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm dark:bg-neutral-800">🛠️</span>
        <div className="min-w-0 flex-1 text-sm text-sky-800 dark:text-sky-200">
          <div className="text-base font-extrabold">راهنمای مدیریت کاربران</div>
          <ul className="mt-2 list-disc space-y-1 pr-5 text-[13px] leading-6">
            <li><b>جستجو و فیلتر:</b> با تایپ در کادر، نتایج خودکار و زنده فیلتر می‌شوند؛ جستجو روی موبایل، نام و ایمیل انجام می‌شود و می‌توانید بر اساس «نقش» و «وضعیت» نیز محدود کنید.</li>
            <li><b>تغییر نقش:</b> از منوی کنار هر کاربر، نقش آن را عوض کنید. توجه: تغییر نقش به «سوپرادمین» دسترسی کامل به این پنل می‌دهد و فقط باید برای کاربران مورداعتماد انجام شود.</li>
            <li><b>تعلیق/فعال‌سازی:</b> سوئیچ کنار هر کاربر، ورود و دسترسی او را مسدود/باز می‌کند (داده‌های او حفظ می‌شود).</li>
            <li><b>عملیات گروهی:</b> با تیک‌زدن چند کاربر، نوار اقدامات گروهی ظاهر می‌شود تا بتوانید هم‌زمان فعال/تعلیق یا نقش آن‌ها را تغییر دهید.</li>
            <li><b>جزئیات کاربر:</b> دکمه «جزئیات» در هر ردیف، اطلاعات کامل‌تر (کیف پول، تعداد سالن‌ها، سفارش‌ها و تاریخ‌ها) را باز می‌کند.</li>
            <li><b>خروجی اکسل/CSV:</b> با دکمه «خروجی CSV» کل کاربران فیلترشده در یک فایل دانلود می‌شوند.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function RoleLegend({ counts }: { counts?: Record<string, number> }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-neutral-800 dark:text-neutral-100">
        <span>🎭</span> انواع نقش‌ها و دسترسی‌ها
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ROLE_LABEL).map(([k, l]) => {
          const info = ROLE_INFO[k];
          return (
            <div key={k} className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-neutral-800 dark:text-neutral-100">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white ${info?.cls ?? "bg-neutral-400"}`}>
                    {l.slice(0, 1)}
                  </span>
                  {l}
                </span>
                {counts && counts[k] != null && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                    {faInt(counts[k])}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[11px] leading-5 text-neutral-500 dark:text-neutral-400">{info?.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const escCsv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function UserManager({ ctx }: { ctx: Ctx }) {
  const PAGE_SIZE = 25;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [counts, setCounts] = useState<AdminUserCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [isActive, setIsActive] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(
    async (p: number, search: string, r: string, act: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
        if (search) params.set("q", search);
        if (r) params.set("role", r);
        if (act) params.set("isActive", act);
        const res = await fetch(`/api/admin/users?${params}`);
        const d = await res.json();
        if (!d.success) return ctx.setMsg({ ok: false, text: d.error || "خطا" });
        setUsers(d.users as AdminUser[]);
        setTotal(d.total ?? 0);
        setTotalPages(d.totalPages ?? Math.max(1, Math.ceil((d.total ?? 0) / PAGE_SIZE)));
        setCounts(d.counts ?? null);
        setPage(d.page ?? p);
      } catch {
        ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
      } finally {
        setLoading(false);
      }
    },
    [ctx]
  );

  // تغییر جستجو یا فیلترها → پاک‌شدن انتخاب‌ها و بازنشانی صفحه به ۱
  useEffect(() => {
    setSelected(new Set());
    setExpanded(null);
    setPage(1);
  }, [q, role, isActive]);

  // جستجوی خودکار با تأخیر + صفحه‌بندی سمت سرور
  useEffect(() => {
    const t = setTimeout(() => void load(page, q.trim(), role, isActive), 350);
    return () => clearTimeout(t);
  }, [page, q, role, isActive, load]);

  async function changeRole(id: string, next: string) {
    const prev = users.find((u) => u.id === id)?.role;
    if (prev === next) return;
    const r = await ctx.api("/api/admin/users", "PATCH", { userId: id, role: next }, `نقش کاربر به «${ROLE_LABEL[next] ?? next}» تغییر کرد ✅`);
    if (r) void load(page, q.trim(), role, isActive);
  }

  async function toggleActive(u: AdminUser) {
    setBusyId(u.id);
    const r = await ctx.api("/api/admin/users", "PATCH", { userId: u.id, isActive: !u.isActive }, u.isActive ? "حساب کاربر تعلیق شد" : "حساب کاربر فعال شد ✅");
    setBusyId(null);
    if (r) void load(page, q.trim(), role, isActive);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allOnPageSelected = users.length > 0 && users.every((u) => selected.has(u.id));
  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const u of users) next.delete(u.id);
      } else {
        for (const u of users) next.add(u.id);
      }
      return next;
    });
  }

  async function bulkSetActive(active: boolean) {
    if (!selected.size || bulkBusy) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of selected) {
      try {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id, isActive: active }),
        });
        const d = await res.json();
        if (d.success) ok++;
      } catch {
        /* ignore */
      }
    }
    setBulkBusy(false);
    ctx.setMsg({ ok: true, text: `${faInt(ok)} کاربر از ${faInt(selected.size)} ${active ? "فعال شدند" : "تعلیق شدند"} ✅` });
    setSelected(new Set());
    void load(page, q.trim(), role, isActive);
  }

  async function bulkSetRole(next: string) {
    if (!selected.size || bulkBusy) return;
    setBulkBusy(true);
    let ok = 0;
    for (const id of selected) {
      try {
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: id, role: next }),
        });
        const d = await res.json();
        if (d.success) ok++;
      } catch {
        /* ignore */
      }
    }
    setBulkBusy(false);
    ctx.setMsg({ ok: true, text: `نقش ${faInt(ok)} کاربر از ${faInt(selected.size)} به «${ROLE_LABEL[next] ?? next}» تغییر کرد ✅` });
    setSelected(new Set());
    void load(page, q.trim(), role, isActive);
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const base = new URLSearchParams({ limit: "200" });
      if (q.trim()) base.set("q", q.trim());
      if (role) base.set("role", role);
      if (isActive) base.set("isActive", isActive);
      let all: AdminUser[] = [];
      let p = 1;
      let totalRows = 0;
      while (true) {
        const res = await fetch(`/api/admin/users?${base}&page=${p}`);
        const d = await res.json();
        if (!d.success) break;
        all = all.concat((d.users as AdminUser[]) || []);
        totalRows = d.total ?? 0;
        if ((d.users || []).length === 0 || all.length >= totalRows) break;
        p++;
      }
      const header = ["شناسه", "موبایل", "نام", "ایمیل", "نقش", "فعال", "امتیاز", "تاریخ ثبت", "تأییدشده", "موجودی کیف پول", "تعداد سالن", "تعداد سفارش"];
      const rows = all.map((u) =>
        [
          u.id,
          u.phone,
          u.name ?? "",
          u.email ?? "",
          u.role,
          u.isActive ? "بله" : "خیر",
          String(u.loyaltyPoints),
          u.createdAt ?? "",
          u.verifiedAt ? "بله" : "خیر",
          String(u.wallets?.[0]?.balance ?? ""),
          String(u._count?.ownedSalons ?? 0),
          String(u._count?.orders ?? 0),
        ]
          .map(escCsv)
          .join(",")
      );
      const csv = "\uFEFF" + [header.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      ctx.setMsg({ ok: true, text: `خروجی CSV با ${faInt(all.length)} رکورد آماده شد ✅` });
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در ساخت خروجی CSV" });
    } finally {
      setExporting(false);
    }
  }

  const byRole = counts?.byRole ?? {};
  const roleEntries = Object.entries(byRole);

  return (
    <div className="space-y-5">
      {/* راهنما */}
      <HelpBanner />

      {/* سربرگ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-neutral-900 dark:text-neutral-100">مدیریت کاربران</h3>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">جستجو، فیلتر، تغییر نقش و مدیریت وضعیت کلیه کاربران پلتفرم</p>
        </div>
        {counts && roleEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {roleEntries.map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                <span className={`h-2 w-2 rounded-full ${ROLE_GLOW[k] ?? "bg-neutral-400"}`} />
                {ROLE_LABEL[k] ?? k}
                <span className="text-neutral-400 dark:text-neutral-500">{faInt(v)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* کارت‌های آماری */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UserStatCard label="کل کاربران" value={counts ? faInt(counts.total) : "…"} icon="👥" glow="bg-gradient-to-br from-pink-200 to-rose-300" />
        <UserStatCard label="کاربران فعال" value={counts ? faInt(counts.active) : "…"} icon="✅" glow="bg-gradient-to-br from-emerald-200 to-teal-300" />
        <UserStatCard label="تعلیق‌شده" value={counts ? faInt(counts.suspended) : "…"} icon="⛔" glow="bg-gradient-to-br from-amber-200 to-orange-300" />
        <UserStatCard label="نمایش در این صفحه" value={faInt(users.length)} icon="📄" glow="bg-gradient-to-br from-sky-200 to-indigo-300" />
      </div>

      {/* نوار ابزار جستجو/فیلتر/خروجی */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[13rem] flex-1">
            <input
              className="w-full rounded-xl border border-neutral-300 bg-neutral-50 py-2.5 pr-9 pl-9 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-pink-500 focus:bg-white focus:ring-4 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:bg-neutral-800 dark:focus:ring-pink-950/40"
              placeholder="جستجو: موبایل، نام یا ایمیل…"
              aria-label="جستجوی کاربر"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">🔎</span>
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="پاک کردن جستجو"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 transition hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                ✕
              </button>
            )}
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="فیلتر نقش" className="w-auto cursor-pointer rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm font-semibold text-neutral-700 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:ring-pink-950/40">
            <option value="">همه نقش‌ها</option>
            {Object.entries(ROLE_LABEL).map(([k, l]) => (
              <option key={k} value={k}>{l} ({k})</option>
            ))}
          </select>
          <select value={isActive} onChange={(e) => setIsActive(e.target.value)} aria-label="فیلتر وضعیت" className="w-auto cursor-pointer rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm font-semibold text-neutral-700 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:ring-pink-950/40">
            <option value="">همه وضعیت‌ها</option>
            <option value="true">فعال</option>
            <option value="false">تعلیق‌شده</option>
          </select>
          <button
            onClick={() => void exportCsv()}
            disabled={exporting}
            title="دانلود کل کاربران فیلترشده به‌صورت CSV"
            className="shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            {exporting ? "در حال ساخت..." : "⬇ خروجی CSV"}
          </button>
          <span className="shrink-0 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-black text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {faInt(total)} کاربر
          </span>
        </div>
      </div>

      {/* نوار عملیات گروهی */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pink-300 bg-pink-50/70 p-3 shadow-sm dark:border-pink-800 dark:bg-pink-950/30">
          <div className="flex items-center gap-2 text-sm font-extrabold text-pink-800 dark:text-pink-200">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-black shadow-sm dark:bg-neutral-800">
              {faInt(selected.size)}
            </span>
            کاربر انتخاب‌شده
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => void bulkSetActive(true)} disabled={bulkBusy} className={okBtn}>✓ فعال‌سازی</button>
            <button onClick={() => void bulkSetActive(false)} disabled={bulkBusy} className={dangerBtn}>⛔ تعلیق</button>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) void bulkSetRole(e.target.value);
              }}
              disabled={bulkBusy}
              aria-label="تغییر گروهی نقش"
              className="cursor-pointer rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-bold text-neutral-700 outline-none focus:border-pink-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value="">تغییر نقش…</option>
              {Object.entries(ROLE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l} ({k})</option>
              ))}
            </select>
            <button onClick={() => setSelected(new Set())} disabled={bulkBusy} className={ghostBtn}>پاک کردن</button>
          </div>
        </div>
      )}

      {/* اسکلتون بارگذاری */}
      {loading && users.length === 0 && (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center gap-3.5">
                <div className="h-12 w-12 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-40 max-w-full rounded-full bg-neutral-200 dark:bg-neutral-700" />
                  <div className="h-3 w-64 max-w-full rounded-full bg-neutral-100 dark:bg-neutral-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* حالت خالی */}
      {!loading && users.length === 0 && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white py-14 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <div className="text-4xl">🔍</div>
          <p className="mt-3 text-sm font-bold text-neutral-500 dark:text-neutral-400">کاربری با این شرایط یافت نشد.</p>
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">فیلترها یا عبارت جستجو را تغییر دهید.</p>
        </div>
      )}

      {/* فهرست کاربران */}
      <div className="space-y-2.5">
        {users.map((u) => {
          const initials = (u.name || u.phone || "؟").slice(0, 1);
          const isOpen = expanded === u.id;
          return (
            <div
              key={u.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300 dark:bg-neutral-900 ${
                isOpen
                  ? "border-pink-300 shadow-lg dark:border-pink-800"
                  : "border-neutral-200 hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-lg dark:border-neutral-800 dark:hover:border-pink-900/60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => toggleSelect(u.id)}
                    aria-label={`انتخاب ${u.name ?? u.phone}`}
                    className="h-4 w-4 shrink-0 accent-pink-600"
                  />
                  <div className="relative shrink-0">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-black text-white shadow-md ${!u.isActive ? "grayscale" : ""} ${ROLE_AVATAR[u.role] ?? "bg-gradient-to-br from-pink-400 to-purple-500"}`}>
                      {initials}
                    </span>
                    <span className={`absolute -bottom-0.5 -left-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-neutral-900 ${u.isActive ? "bg-emerald-500" : "bg-red-500"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate text-[15px] font-extrabold text-neutral-900 dark:text-neutral-100">
                        {u.name ?? "بدون نام"}
                      </span>
                      <RoleBadge role={u.role} />
                      {u.verifiedAt ? (
                        <VerifiedBadge />
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-bold text-neutral-500 ring-1 ring-inset ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700">
                          تأییدنشده
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                      <span className="inline-flex items-center gap-1.5 font-bold text-neutral-700 dark:text-neutral-200">
                        <span className="text-neutral-400">📱</span>
                        <span dir="ltr">{u.phone}</span>
                      </span>
                      {u.email && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-neutral-400">✉️</span>
                          <span dir="ltr">{u.email}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-amber-400">⭐</span>
                        {faInt(u.loyaltyPoints)} امتیاز
                      </span>
                      {u.createdAt && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-neutral-400">🕒</span>
                          {faDate(u.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    disabled={busyId === u.id}
                    aria-label={`نقش ${u.name ?? u.phone}`}
                    title="تغییر نقش کاربر"
                    className="cursor-pointer rounded-xl border border-neutral-300 bg-neutral-50 px-2.5 py-1.5 text-xs font-bold text-neutral-700 outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:ring-pink-950/40"
                  >
                    {Object.entries(ROLE_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>{l} ({k})</option>
                    ))}
                  </select>
                  <ActiveToggle on={u.isActive} busy={busyId === u.id} onChange={() => toggleActive(u)} />
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : u.id)}
                    aria-label={isOpen ? "بستن جزئیات" : "نمایش جزئیات"}
                    title={isOpen ? "بستن جزئیات" : "نمایش جزئیات کامل"}
                    className={`rounded-xl border px-2.5 py-1.5 text-xs font-black transition ${
                      isOpen
                        ? "border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-300"
                        : "border-neutral-300 bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    }`}
                  >
                    {isOpen ? "بستن" : "جزئیات"}
                  </button>
                </div>
              </div>

              {/* پنل جزئیات */}
              {isOpen && (
                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3.5 dark:border-neutral-700 dark:bg-neutral-800/40">
                  <div className="mb-2 flex items-center gap-2 text-xs font-extrabold text-neutral-700 dark:text-neutral-200">
                    <span>📋</span> جزئیات کامل کاربر
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    <Info label="شناسه کاربر" value={u.id} dir="ltr" />
                    <Info label="نقش" value={ROLE_LABEL[u.role] ?? u.role} />
                    <Info label="وضعیت" value={u.isActive ? "فعال" : "تعلیق‌شده"} />
                    <Info label="تأیید شماره" value={u.verifiedAt ? `بله — ${faDateTime(u.verifiedAt)}` : "خیر"} />
                    <Info label="تاریخ ثبت‌نام" value={u.createdAt ? faDateTime(u.createdAt) : "—"} />
                    <Info label="امتیاز وفاداری" value={`${faInt(u.loyaltyPoints)} امتیاز`} />
                    <Info label="موجودی کیف پول" value={u.wallets?.[0]?.balance != null ? `${faInt(u.wallets[0].balance)} تومان` : "—"} />
                    <Info label="تعداد سالن‌های مالک" value={String(u._count?.ownedSalons ?? 0)} />
                    <Info label="تعداد سفارش‌ها" value={String(u._count?.orders ?? 0)} />
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-neutral-500 dark:text-neutral-400">
                    💡 <b>تعلیق</b> تنها دسترسی و ورود کاربر را مسدود می‌کند و داده‌های او (نوبت‌ها، سفارش‌ها و مالی) حفظ می‌شوند. برای تغییر «نقش» حتماً از منوی کنار هر کاربر استفاده کنید.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* صفحه‌بندی */}
      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />

      {/* مرجع نقش‌ها */}
      <RoleLegend counts={byRole} />
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("limit", "25");
    fetch(`/api/admin/support?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setTickets(d.tickets as Ticket[]);
          setSummary(d.summary as Record<string, number>);
          setTotal(d.total ?? 0);
          setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statusFilter, page]);

  async function reload() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("limit", "25");
    const r = await fetch(`/api/admin/support?${params}`);
    const d = await r.json();
    if (d.success) {
      setTickets(d.tickets as Ticket[]);
      setSummary(d.summary as Record<string, number>);
      setTotal(d.total ?? 0);
      setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
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

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}

/* ─── گزارش اعلان‌ها ─────────────────────────────────────────────────── */

function NotificationReport({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<NotifData | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const TYPE_LABEL: Record<string, string> = {
    OTP: "کد ورود",
    APPOINTMENT_CONFIRM: "تأیید نوبت",
    APPOINTMENT_CANCEL: "لغو نوبت",
    CANCEL: "لغو نوبت",
    APPOINTMENT_CHANGED: "تغییر نوبت",
    APPOINTMENT_STATUS: "تغییر وضعیت نوبت",
    REMINDER: "یادآوری نوبت",
    WAITLIST: "صف انتظار",
    WAITLIST_FREED: "آزاد شدن ظرفیت",
    SUBSCRIPTION: "اشتراک",
    SUBSCRIPTION_ACTIVATED: "فعال‌سازی اشتراک",
    SUBSCRIPTION_RENEWED: "تمدید اشتراک",
    SUBSCRIPTION_EXPIRED: "انقضای اشتراک",
    SUBSCRIPTION_RENEWAL_REMINDER: "یادآوری تمدید اشتراک",
    SUBSCRIPTION_PAYMENT_FAILED: "خطای پرداخت اشتراک",
    INVOICE_PAY_LINK: "لینک پرداخت فاکتور",
    BROADCAST: "ارسال گروهی",
    MARKETING: "پیامک تبلیغاتی",
    SUPPORT_REPLY: "پاسخ پشتیبانی",
    SMS_LIMIT_REACHED: "اتمام سقف پیامک",
  };
  const CHANNEL_LABEL: Record<string, string> = { SMS: "پیامک", EMAIL: "ایمیل", IN_APP: "درون‌برنامه‌ای" };
  const CHANNEL_ICON: Record<string, string> = { SMS: "📱", EMAIL: "✉️", IN_APP: "🔔" };
  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    PENDING: { label: "در صف ارسال", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    SENT: { label: "ارسال شد", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    FAILED: { label: "ناموفق", cls: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" },
    DROPPED: { label: "رها شده", cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" },
  };

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (channelFilter) params.set("channel", channelFilter);
    params.set("page", String(page));
    params.set("limit", "25");
    fetch(`/api/admin/notifications?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setData({ summary: d.summary as NotifSummary, notifications: d.notifications as NotifItem[] });
          setTotal(d.total ?? 0);
          setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statusFilter, channelFilter, page]);

  async function reload() {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (channelFilter) params.set("channel", channelFilter);
    params.set("page", String(page));
    params.set("limit", "25");
    const r = await fetch(`/api/admin/notifications?${params}`);
    const d = await r.json();
    if (d.success) {
      setData({ summary: d.summary as NotifSummary, notifications: d.notifications as NotifItem[] });
      setTotal(d.total ?? 0);
      setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
    }
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
  const grandTotal = (s.PENDING ?? 0) + (s.SENT ?? 0) + (s.FAILED ?? 0) + (s.DROPPED ?? 0);
  const cards = [
    { label: "کل اعلان‌ها", value: faInt(grandTotal), icon: "📊" },
    { label: "در صف ارسال", value: faInt(s.PENDING), icon: "⏳" },
    { label: "ارسال‌شده", value: faInt(s.SENT), icon: "✅" },
    { label: "ناموفق", value: faInt(s.FAILED), icon: "⚠️" },
    { label: "رها شده", value: faInt(s.DROPPED), icon: "🗑" },
    { label: "هزینه تخمینی (تومان)", value: faInt(s.estimatedCost), icon: "💸" },
  ];
  const channels = s.channels ?? {};

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-xl">{c.icon}</div>
            <div className="mt-1 text-lg font-black text-neutral-900 dark:text-neutral-100">{c.value}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="font-bold text-neutral-600 dark:text-neutral-300">توزیع کانال‌ها:</span>
        {(["SMS", "EMAIL", "IN_APP"] as const).map((ch) => (
          <span key={ch} className="rounded-full border border-neutral-200 bg-white px-3 py-1 font-bold dark:border-neutral-700 dark:bg-neutral-900">
            {CHANNEL_ICON[ch] ?? ""} {CHANNEL_LABEL[ch] ?? ch}: {faInt(channels[ch] ?? 0)}
          </span>
        ))}
        {(s.unitCost ?? 0) > 0 && <span>💡 هزینهٔ هر پیامک: {faInt(s.unitCost)} تومان</span>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select className={`${input} sm:w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="وضعیت">
          <option value="">همه وضعیت‌ها</option>
          <option value="PENDING">در صف ارسال</option>
          <option value="SENT">ارسال‌شده</option>
          <option value="FAILED">ناموفق</option>
          <option value="DROPPED">رها شده</option>
        </select>
        <select className={`${input} sm:w-auto`} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} aria-label="کانال">
          <option value="">همه کانال‌ها</option>
          <option value="SMS">پیامک</option>
          <option value="EMAIL">ایمیل</option>
          <option value="IN_APP">درون‌برنامه‌ای</option>
        </select>
        <button onClick={() => reload()} className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-bold text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800">
          🔄 تازه‌سازی
        </button>
        <button onClick={() => retry()} disabled={busy} className={`${darkBtn} disabled:opacity-50`}>
          {busy ? "در حال تلاش..." : "تلاش مجدد برای همه ناموفق‌ها"}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {data.notifications.length === 0 && <p className="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">اعلانی یافت نشد.</p>}
        {data.notifications.map((n) => {
          const st = STATUS_LABEL[n.status] ?? { label: n.status, cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" };
          const typeLabel = TYPE_LABEL[n.type] ?? n.type.replace(/_/g, " ");
          const recipientLabel = n.channel === "IN_APP" ? "کاربر" : n.channel === "EMAIL" ? "ایمیل" : "گیرنده پیامک";
          return (
            <div key={n.id} className={`${listRow} flex flex-wrap items-start justify-between gap-3`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-black text-neutral-800 dark:text-neutral-100">{typeLabel}</span>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    {CHANNEL_ICON[n.channel] ?? ""} {CHANNEL_LABEL[n.channel] ?? n.channel}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                  {n.attempts > 0 && <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">تلاش: {faInt(n.attempts)} از ۵</span>}
                </div>
                <div className="mt-2 grid gap-1 text-xs text-neutral-500 dark:text-neutral-400 sm:grid-cols-2">
                  <div>
                    {recipientLabel}: <span className="font-bold text-neutral-700 dark:text-neutral-200" dir="ltr">{n.recipient}</span>
                  </div>
                  <div>
                    💈 سالن: {n.salonName ? <span className="font-bold text-neutral-700 dark:text-neutral-200">{n.salonName}</span> : "—"}
                  </div>
                  <div>📝 ثبت اعلان: {faDateTime(n.createdAt)}</div>
                  {n.sentAt ? (
                    <div className="font-bold text-emerald-700 dark:text-emerald-300">📤 تاریخ ارسال: {faDateTime(n.sentAt)}</div>
                  ) : (
                    <div className="font-bold text-amber-700 dark:text-amber-300">⏳ تاریخ تلاش بعدی ارسال: {faDateTime(n.nextAttemptAt)}</div>
                  )}
                </div>
                {n.lastError && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400" dir="ltr">
                    ⚠️ {String(n.lastError).slice(0, 220)}
                  </div>
                )}
              </div>
              {(n.status === "FAILED" || n.status === "DROPPED") && (
                <button onClick={() => retry(n.id)} disabled={busy} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-300">
                  تلاش مجدد
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
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
    // فهرست کامل برای انتخاب‌گر «سالن‌های نمونه» (صفحه‌بندی فهرست مدیریتی داخل SalonManagerList انجام می‌شود)
    const r = await fetch("/api/salons?limit=200");
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
    Promise.all([fetch("/api/salons?limit=200"), fetch("/api/admin/discounts?limit=200")])
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
        {tab === "payouts" && <PayoutManager ctx={ctx} />}
        {tab === "users" && <UserManager ctx={ctx} />}
        {tab === "packages" && <PackageManager ctx={ctx} />}
        {tab === "limits" && <LimitMatrixPanel ctx={ctx} />}
        {tab === "discounts" && <DiscountManager ctx={ctx} />}
        {tab === "sms" && (
          <>
            <SentCodesToggle ctx={ctx} />
            <SmsTest ctx={ctx} />
          </>
        )}
        {tab === "broadcast" && <BroadcastView ctx={ctx} />}
        {tab === "audit" && <AuditView ctx={ctx} />}
        {tab === "backup" && <AdminBackups ctx={ctx} />}
        {tab === "security" && <SecurityView ctx={ctx} />}
        {tab === "ai" && <AiSettings />}
        {tab === "settings" && <SystemSettings />}
      </div>
    </div>
  );
}
