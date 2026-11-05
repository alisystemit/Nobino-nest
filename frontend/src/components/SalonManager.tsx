"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import RevenueChart from "@/components/RevenueChart";
import DailyBoard from "@/components/DailyBoard";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";
import TimeField from "@/components/ui/TimeField";
import Pagination from "@/components/ui/Pagination";
import { CampaignSegmentPanel } from "@/components/CampaignSegmentPanel";
import { SEGMENT_KEYS, useSegmentBuilder, type SegCall } from "@/lib/campaign-segments";
import { zonedTimeToIso } from "@/lib/time/zoned";
import { formatJalali, toPersianDigits } from "@/lib/time/jalali";
import { mbToBytes, sizeHintFa, uploadLimitsSync } from "@/lib/upload-limits";
import { useI18n } from "@/lib/i18n";

/**
 * سقف حجم فایل پروندهٔ مشتری: اول مقدار همان پرونده که سرور فرستاده،
 * بعد کش تنظیمات سوپرادمین؛ پیش‌فرض‌ها هم‌نام کد بک‌اند (۵ و ۱۰ مگابایت).
 */
function crmMaxMb(detail: { photoMaxMb?: number; voiceMaxMb?: number } | null | undefined, kind: "photo" | "voice"): number {
  const fromDetail = detail ? (kind === "voice" ? detail.voiceMaxMb : detail.photoMaxMb) : undefined;
  const fromPanel = uploadLimitsSync().crm[kind === "voice" ? "voiceMaxMb" : "photoMaxMb"];
  return Number(fromDetail ?? fromPanel) || Number(fromPanel) || (kind === "voice" ? 10 : 5);
}

/* ─── انواع ─────────────────────────────────────────────────────────── */

type Service = { id: string; name: string; durationMin: number; price: number; description?: string | null; category?: string | null; bufferMin?: number; isActive: boolean };
type StaffItem = {
  id: string;
  name: string;
  title?: string | null;
  role: string;
  commissionPercent: number;
  branchId?: string | null;
  avatarUrl?: string | null;
  specialties: string[];
  isActive: boolean;
  services?: { id: string; name: string }[];
  schedule?: { day: number; open: string; close: string; isClosed?: boolean }[] | null;
};
type Block = { id: string; startAt: string; endAt: string; reason?: string | null; staff?: { name: string } | null };
type Branch = { id: string; name: string; city?: string | null; address?: string | null; phone?: string | null; isActive: boolean };
type CashEntry = { id: string; branch?: { name: string } | null; cashAmount: number; cardAmount: number; onlineAmount: number; expenseAmount: number; note?: string | null; createdAt: string };
type CashTotals = { cash: number; card: number; online: number; expense: number; net: number };
type WaitlistEntry = { id: string; customerName: string; customerPhone: string; note?: string | null; status: string };
type Holiday = { id: string; date: string; isClosed: boolean; openTime?: string | null; closeTime?: string | null; reason?: string | null; branch?: { name: string } | null };
type Customer = {
  id: string;
  phone: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  note?: string | null;
  visits: number;
  completed: number;
  cancelled: number;
  noShow: number;
  spend: number;
  lastVisit?: string | null;
  mediaCount?: number;
  notesCount?: number;
};

type CustomerNote = { id: string; note: string; createdAt: string };
type CustomerMedia = { id: string; type: "photo" | "voice"; url: string; name?: string | null; mimeType?: string | null; size?: number; createdAt: string };
type CustomerAppt = {
  id: string;
  startAt: string;
  status: string;
  channel: string;
  customerName: string | null;
  service?: { name: string; price: number } | null;
  employee?: { name: string } | null;
  branch?: { name: string } | null;
};
type Invoice = { id: string; number: string; issuedAt: string; period: string; amount: number; status: string; kind?: string; customerName?: string | null; customerPhone?: string | null; description?: string | null; payLink?: string | null };
type Campaign = { id: string; name: string; channel: string; segment: string; segmentSummary?: string; status: string; sentCount: number; scheduledAt?: string | null; sentAt?: string | null };
type ApptItem = { id: string; startAt: string; customerName: string; employee?: string | null; service?: string | null; status: string };
type PeakHour = { hour: number; count: number };
type StaffPerf = { id: string; name: string; completed: number; total: number };
type ReportData = {
  total: number;
  completed: number;
  cancelRate: number;
  distinctCustomers: number;
  returnRate: number;
  newCustomersToday: number;
  peakHours: PeakHour[];
  staffPerformance: StaffPerf[];
};
type FinancialReport = { revenueLabel: string; completed: number; cancelled: number; paidSubscriptionsLabel: string };
type ApiRes<T = Record<string, unknown>> = { success: boolean; error?: string } & T;

type Msg = { ok: boolean; text: string };
type MsgSetter = Dispatch<SetStateAction<Msg | null>>;

type Tab = "services" | "staff" | "blocks" | "booking" | "branches" | "cash" | "report" | "waitlist" | "calendar" | "board" | "holidays" | "customers" | "invoices" | "campaigns" | "domain" | "data";

/** زمینه مشترک برای زیربخش‌ها */
type Ctx = {
  salonId: string;
  salonSlug?: string;
  /** منطقهٔ زمانی سالن برای تبدیل تاریخ شمسی → لحظهٔ UTC */
  timezone: string;
  base: string;
  api: <T = ApiRes>(path: string, method: string, body?: unknown, okMsg?: string) => Promise<T | null>;
  refreshServices: () => Promise<void>;
  refreshStaff: () => Promise<void>;
  refreshBlocks: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshCash: () => Promise<void>;
  branches: Branch[];
  staff: StaffItem[];
  services: Service[];
  todayTotals: CashTotals | null;
  setMsg: MsgSetter;
};

/* ─── برچسب‌های فارسی ───────────────────────────────────────────────── */

const APPT_STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: "در انتظار", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  CONFIRMED: { label: "تأییدشده", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  COMPLETED: { label: "انجام‌شده", cls: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  CANCELLED: { label: "لغوشده", cls: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300" },
  NO_SHOW: { label: "عدم حضور", cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" },
};

const WAITLIST_STATUS: Record<string, { label: string; cls: string }> = {
  WAITING: { label: "در انتظار", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  NOTIFIED: { label: "اطلاع‌رسانی‌شده", cls: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  BOOKED: { label: "رزرو شد", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  EXPIRED: { label: "منقضی", cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" },
};

const STAFF_ROLE: Record<string, string> = {
  STYLIST: "آرایشگر",
  MANAGER: "مدیر",
  RECEPTION: "پذیرش",
  OWNER: "مالک",
};

const INVOICE_STATUS: Record<string, string> = {
  PAID: "پرداخت‌شده",
  PENDING: "در انتظار",
  OVERDUE: "معوق",
};

const CAMPAIGN_STATUS: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  QUEUED: "در صف",
  SCHEDULED: "زمان‌بندی‌شده",
  SENDING: "در حال ارسال",
  SENT: "ارسال‌شده",
  FAILED: "ناموفق",
};

const CAMPAIGN_SEGMENT: Record<string, string> = {
  ALL: "همه مشتریان",
  RETURNING: "مشتریان بازگشتی",
  NEW: "مشتری تازه",
  RECENT: "اخیراً آمده",
  SILENT: "بدون مراجعه",
  VIP: "مشتریان ویژه",
};

/** کلیدهای i18n برای چیپ‌های بخش‌بندی — حالت انگلیسی پنل هم برچسب بومی دارد */
const SEGMENT_I18N: Record<(typeof SEGMENT_KEYS)[number], string> = {
  ALL: "campaigns.all",
  RETURNING: "campaigns.returning",
  NEW: "campaigns.new",
  RECENT: "campaigns.recent",
  SILENT: "campaigns.silent",
  VIP: "campaigns.vip",
};

const CHANNEL_LABEL: Record<string, string> = {
  SMS: "پیامک",
  EMAIL: "ایمیل",
};

const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

const inputCls =
  "h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none transition focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

const cardCls = "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

const primaryBtn =
  "flex h-11 items-center justify-center rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-5 text-sm font-bold text-white shadow-md shadow-pink-500/20 transition hover:opacity-95";
const darkBtn = "flex h-11 items-center justify-center rounded-xl bg-neutral-900 px-5 text-sm font-bold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300";

/* ─── فرم خدمت ───────────────────────────────────────────────────────── */

function ServiceForm({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [price, setPrice] = useState(0);
  const [category, setCategory] = useState("");
  const [bufferMin, setBufferMin] = useState(0);
  async function submit() {
    const r = await ctx.api(`${ctx.base}/services`, "POST", { name, durationMin, price, category: category || undefined, bufferMin: Number(bufferMin) }, "خدمت اضافه شد ✅");
    if (r) {
      setName("");
      setDurationMin(30);
      setPrice(0);
      setCategory("");
      setBufferMin(0);
      ctx.refreshServices();
    }
  }
  return (
    <div className={`${cardCls} grid gap-3 sm:grid-cols-[1fr_100px_120px_100px_100px_auto]`}>
      <input className={inputCls} placeholder="نام خدمت" aria-label="نام خدمت" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputCls} type="number" placeholder="مدت (دق)" aria-label="مدت" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
      <input className={inputCls} type="number" placeholder="قیمت (تومان)" aria-label="قیمت" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
      <input className={inputCls} placeholder="دسته‌بندی" aria-label="دسته‌بندی" value={category} onChange={(e) => setCategory(e.target.value)} />
      <input className={inputCls} type="number" placeholder="استراحت (دق)" aria-label="استراحت" value={bufferMin} onChange={(e) => setBufferMin(Number(e.target.value))} />
      <button onClick={submit} className={darkBtn}>افزودن</button>
    </div>
  );
}

/* ─── فرم کارمند ─────────────────────────────────────────────────────── */

function StaffForm({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState("STYLIST");
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [branchId, setBranchId] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  async function uploadAvatar(file: File) {
    // پیش‌بررسی حجم با سقف پویای سوپرادمین (بررسی قطعی سمت سرور است)
    const { avatarMaxMb } = uploadLimitsSync();
    if (file.size > mbToBytes(avatarMaxMb)) {
      ctx.setMsg({ ok: false, text: `حجم تصویر ${sizeHintFa(avatarMaxMb)} است.` });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const d = await res.json();
      if (d.success) setAvatarUrl(d.url);
      else ctx.setMsg({ ok: false, text: d.error || "خطا در بارگذاری تصویر" });
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در بارگذاری تصویر" });
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    const r = await ctx.api(
      `${ctx.base}/staff`,
      "POST",
      {
        name,
        title: title || undefined,
        role,
        commissionPercent: Number(commissionPercent),
        branchId: branchId || undefined,
        avatarUrl: avatarUrl || undefined,
        specialties: specialties.split("،").map((s) => s.trim()).filter(Boolean),
      },
      "کارمند اضافه شد ✅"
    );
    if (r) {
      setName("");
      setTitle("");
      setCommissionPercent(0);
      setBranchId("");
      setSpecialties("");
      setAvatarUrl("");
      ctx.refreshStaff();
    }
  }
  return (
    <div className={`${cardCls} grid gap-3 sm:grid-cols-[auto_1fr_1fr_100px_1fr_auto]`}>
      <div className="relative">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-pink-100 to-purple-100 text-lg font-black text-pink-600">
          {avatarUrl ? (
            <img src={avatarUrl} alt="آواتار" className="h-full w-full object-cover" />
          ) : (
            (name || "؟").slice(0, 1)
          )}
        </div>
        <label className={`absolute -bottom-1 -left-1 cursor-pointer rounded-full bg-neutral-900 px-1.5 py-0.5 text-[9px] font-bold text-white ${uploading ? "opacity-60" : ""}`}>
          {uploading ? "..." : "عکس"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadAvatar(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <input className={inputCls} placeholder="نام کارمند" value={name} onChange={(e) => setName(e.target.value)} />
      <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>
        {Object.entries(STAFF_ROLE).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <input className={inputCls} type="number" placeholder="کمیسیون ٪" value={commissionPercent} onChange={(e) => setCommissionPercent(Number(e.target.value))} />
      <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
        <option value="">شعبه (همه)</option>
        {ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      <button onClick={submit} className={darkBtn}>افزودن</button>
      <div className="sm:col-span-5 sm:col-start-2">
        <input className={inputCls} placeholder="سمت نمایشی (مثلاً ارشد)" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="sm:col-span-5 sm:col-start-2">
        <input className={inputCls} placeholder="تخصص‌ها (با ویرگول)" value={specialties} onChange={(e) => setSpecialties(e.target.value)} />
      </div>
    </div>
  );
}

/* ─── گزارش عملکرد ───────────────────────────────────────────────────── */

function ReportView({ ctx }: { ctx: Ctx }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showRevenue, setShowRevenue] = useState(false);
  const [financial, setFinancial] = useState<FinancialReport | null>(null);
  const [finFrom, setFinFrom] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [finTo, setFinTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    let cancelled = false;
    fetch(`${ctx.base}/report`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setReport(d.report as ReportData);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ctx.base]);

  async function analyze() {
    setAiLoading(true);
    try {
      const r = await fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ salonId: ctx.salonId }) });
      const d = await r.json();
      setAiAnalysis(d.summary ?? d.error);
    } catch {
      setAiAnalysis("خطا در تحلیل");
    } finally {
      setAiLoading(false);
    }
  }

  async function loadFinancial() {
    const r = await fetch(`${ctx.base}/financial?from=${finFrom}&to=${finTo}`);
    const d = await r.json();
    if (d.success) setFinancial(d.report as FinancialReport);
    else ctx.setMsg({ ok: false, text: d.error || "خطا" });
  }

  if (!report) return <p className="py-6 text-center text-neutral-400">در حال محاسبه گزارش...</p>;

  const cards = [
    { label: "کل نوبت‌ها", value: toPersianDigits(report.total), icon: "📋" },
    { label: "انجام‌شده", value: toPersianDigits(report.completed), icon: "✅" },
    { label: "نرخ لغو", value: `${toPersianDigits(report.cancelRate)}٪`, icon: "❌" },
    { label: "مشتریان متمایز", value: toPersianDigits(report.distinctCustomers), icon: "👥" },
    { label: "نرخ مراجعه مجدد", value: `${toPersianDigits(report.returnRate)}٪`, icon: "🔁" },
    { label: "مشتری جدید امروز", value: toPersianDigits(report.newCustomersToday), icon: "🆕" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={analyze} disabled={aiLoading} className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-purple-700 disabled:opacity-50">
          {aiLoading ? "در حال تحلیل..." : "🤖 تحلیل با هوش مصنوعی"}
        </button>
        <button onClick={() => setShowRevenue((s) => !s)} className={primaryBtn}>
          {showRevenue ? "پنهان‌سازی نمودار" : "📊 نمودار درآمد"}
        </button>
      </div>
      {showRevenue && <div className="mb-4"><RevenueChart salonId={ctx.salonId} /></div>}

      {/* گزارش مالی بازه‌ای */}
      <div className={cardCls}>
        <h4 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">گزارش مالی بازه‌ای</h4>
        <div className="mt-2 grid gap-2 sm:flex sm:flex-wrap sm:items-end">
          <div className="w-full sm:w-auto">
            <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">از تاریخ (شمسی)</label>
            <JalaliDatePicker className="mt-1 sm:w-44" value={finFrom} onChange={setFinFrom} timeZone={ctx.timezone} />
          </div>
          <div className="w-full sm:w-auto">
            <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">تا تاریخ (شمسی)</label>
            <JalaliDatePicker className="mt-1 sm:w-44" value={finTo} onChange={setFinTo} timeZone={ctx.timezone} />
          </div>
          <button onClick={loadFinancial} className={`${darkBtn} w-full sm:w-auto`}>نمایش</button>
        </div>
        {financial && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["درآمد خدمات (انجام‌شده)", financial.revenueLabel],
              ["نوبت‌های انجام‌شده", String(financial.completed)],
              ["لغوها", String(financial.cancelled)],
              ["پرداخت اشتراک", financial.paidSubscriptionsLabel],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-neutral-50 px-3 py-2 dark:bg-neutral-800">
                <div className="text-sm font-black text-neutral-800 dark:text-neutral-100">{value}</div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {aiAnalysis && (
        <div className="mb-4 rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm leading-relaxed text-purple-900 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
          {aiAnalysis}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className={cardCls}>
            <div className="text-xl sm:text-2xl">{c.icon}</div>
            <div className="mt-1.5 text-lg font-black text-neutral-900 sm:mt-2 sm:text-xl dark:text-neutral-100">{c.value}</div>
            <div className="mt-1 text-[11px] text-neutral-500 sm:text-xs dark:text-neutral-400">{c.label}</div>
          </div>
        ))}
      </div>

      {report.peakHours.length > 0 && (
        <div className={`${cardCls} mt-4`}>
          <h4 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">ساعات پرتقاضا</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {report.peakHours.map((p) => (
              <span key={p.hour} className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                {p.hour}:00 — {p.count} نوبت
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={`${cardCls} mt-4`}>
        <h4 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">بهره‌وری کارکنان</h4>
        <div className="mt-2 space-y-2">
          {report.staffPerformance.map((s) => (
            <div key={s.id} className="flex justify-between rounded-xl bg-neutral-50 px-4 py-2 text-sm dark:bg-neutral-800">
              <span className="font-bold text-neutral-700 dark:text-neutral-200">{s.name}</span>
              <span className="text-neutral-500 dark:text-neutral-400">{s.completed} انجام‌شده از {s.total}</span>
            </div>
          ))}
          {report.staffPerformance.length === 0 && <p className="text-xs text-neutral-400">کارمندی یافت نشد.</p>}
        </div>
      </div>
    </div>
  );
}

/* ─── فرم شعبه ───────────────────────────────────────────────────────── */

function BranchForm({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  async function submit() {
    const r = await ctx.api(`${ctx.base}/branches`, "POST", { name, city: city || undefined, address: address || undefined }, "شعبه اضافه شد ✅");
    if (r) {
      setName("");
      setCity("");
      setAddress("");
      ctx.refreshBranches();
      ctx.refreshStaff();
    }
  }
  return (
    <div className={`${cardCls} grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]`}>
      <input className={inputCls} placeholder="نام شعبه" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputCls} placeholder="شهر" value={city} onChange={(e) => setCity(e.target.value)} />
      <input className={inputCls} placeholder="آدرس" value={address} onChange={(e) => setAddress(e.target.value)} />
      <button onClick={submit} className={darkBtn}>افزودن</button>
    </div>
  );
}

/* ─── صف انتظار ──────────────────────────────────────────────────────── */

function WaitlistView({ ctx }: { ctx: Ctx }) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [ctx.salonSlug]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    fetch(`/api/salons/${ctx.salonSlug}/waitlist?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setEntries(d.entries as WaitlistEntry[]);
          setTotal(d.total ?? 0);
          setTotalPages(d.totalPages ?? Math.max(1, Math.ceil((d.total ?? 0) / 25)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ctx.salonSlug, page]);

  return (
    <div className="space-y-2">
      {entries.length === 0 && <p className="py-6 text-center text-neutral-400">مشتری در صف انتظار نیست.</p>}
      {entries.map((e) => {
        const st = WAITLIST_STATUS[e.status] ?? { label: e.status, cls: "bg-neutral-100 text-neutral-500" };
        return (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div>
              <div className="font-bold text-neutral-800 dark:text-neutral-100">
                {e.customerName} <span className="text-xs text-neutral-400" dir="ltr">{e.customerPhone}</span>
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">{e.note ?? "بدون توضیح"}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.label}</span>
              {e.status === "WAITING" && (
                <button
                  onClick={() =>
                    ctx
                      .api(`/api/salons/${ctx.salonSlug}/waitlist/${e.id}`, "PATCH", { status: "NOTIFIED" }, "اطلاع‌رسانی شد ✅")
                      .then(() => {
                        setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "NOTIFIED" } : x)));
                      })
                  }
                  className="h-10 rounded-lg bg-sky-500 px-3 text-xs font-bold text-white hover:bg-sky-600"
                >
                  اطلاع‌رسانی شد
                </button>
              )}
            </div>
          </div>
        );
      })}

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}

/* ─── تقویم ──────────────────────────────────────────────────────────── */

function CalendarView({ ctx }: { ctx: Ctx }) {
  const [mode, setMode] = useState<"day" | "week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [appts, setAppts] = useState<ApptItem[]>([]);
  const [staffFilter, setStaffFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // بازه نمایش بر اساس نمای انتخابی (هفته از شنبه)
  const range = useMemo(() => {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    if (mode === "week") {
      const offset = (start.getDay() + 1) % 7; // شنبه=0
      start.setDate(start.getDate() - offset);
    } else if (mode === "month") {
      start.setDate(1);
      const offset = (start.getDay() + 1) % 7;
      start.setDate(start.getDate() - offset); // شروع از شنبهٔ قبل
    }
    const end = new Date(start);
    if (mode === "day") end.setDate(end.getDate() + 1);
    else if (mode === "week") end.setDate(end.getDate() + 7);
    else end.setMonth(end.getMonth() + 1);
    return { start, end };
  }, [anchor, mode]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/appointments?from=${range.start.toISOString()}&to=${range.end.toISOString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success) setAppts(data.appointments as ApptItem[]);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  function shift(delta: number) {
    setLoading(true);
    const next = new Date(anchor);
    if (mode === "day") next.setDate(next.getDate() + delta);
    else if (mode === "week") next.setDate(next.getDate() + delta * 7);
    else next.setMonth(next.getMonth() + delta);
    setAnchor(next);
  }

  function gotoToday() {
    setLoading(true);
    setAnchor(new Date());
  }

  function changeMode(m: "day" | "week" | "month") {
    setLoading(true);
    setMode(m);
  }

  const filtered = appts.filter((a) => {
    if (staffFilter && a.employee !== staffFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    if (serviceFilter && a.service !== serviceFilter) return false;
    return true;
  });

  const days: Date[] = [];
  if (mode === "month") {
    const cursor = new Date(range.start);
    while (cursor < range.end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const count = mode === "day" ? 1 : 7;
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    if (mode === "week") start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
  }

  const title =
    mode === "day"
      ? anchor.toLocaleDateString("fa-IR", { weekday: "long", day: "numeric", month: "long" })
      : mode === "week"
        ? `${range.start.toLocaleDateString("fa-IR", { day: "numeric", month: "long" })} تا ${new Date(range.start.getTime() + 6 * 864e5).toLocaleDateString("fa-IR", { day: "numeric", month: "long" })}`
        : anchor.toLocaleDateString("fa-IR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => shift(-1)} className="h-10 rounded-lg bg-neutral-100 px-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">قبلی</button>
        <button onClick={gotoToday} className="h-10 rounded-lg bg-neutral-900 px-3 text-sm font-bold text-white dark:bg-neutral-100 dark:text-neutral-900">امروز</button>
        <button onClick={() => shift(1)} className="h-10 rounded-lg bg-neutral-100 px-3 text-sm font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">بعدی</button>
        <span className="w-full text-sm font-bold text-neutral-700 sm:w-auto dark:text-neutral-200">{title}</span>
        <div className="ms-auto flex gap-1">
          {(["day", "week", "month"] as const).map((m) => (
            <button
              key={m}
              onClick={() => changeMode(m)}
              className={`h-10 rounded-lg px-3 text-xs font-bold transition ${mode === m ? "bg-pink-600 text-white" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}
            >
              {m === "day" ? "روز" : m === "week" ? "هفته" : "ماه"}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select className={inputCls} value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)}>
          <option value="">همه آرایشگران</option>
          {ctx.staff.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select className={inputCls} value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
          <option value="">همه خدمات</option>
          {ctx.services.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
        <select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(APPT_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
      </div>

      {loading && <p className="mb-2 text-xs text-neutral-400">در حال بارگیری...</p>}

      <div className={mode === "month" ? "grid grid-cols-7 gap-1.5" : mode === "day" ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"}>
        {days.map((day) => {
          const key = dayKey(day);
          const dayAppts = filtered
            .filter((a) => dayKey(new Date(a.startAt)) === key)
            .sort((a, b) => a.startAt.localeCompare(b.startAt));
          return (
            <div key={key} className={`rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-sm sm:p-2.5 dark:border-neutral-800 dark:bg-neutral-900 ${mode === "month" ? "min-h-[86px] sm:min-h-[110px]" : ""}`}>
              <div className="mb-1.5 flex items-center justify-between gap-1">
                <span className="truncate text-[10px] font-extrabold text-neutral-800 sm:text-xs dark:text-neutral-100">{mode === "month" ? DAY_NAMES[(day.getDay() + 1) % 7].slice(0, 1) : DAY_NAMES[(day.getDay() + 1) % 7]}</span>
                <span className="shrink-0 text-[9px] text-neutral-400 sm:text-[10px]" dir="ltr">{dayKey(day).slice(5)}</span>
              </div>
              <div className="space-y-1">
                {dayAppts.length === 0 && mode !== "month" && <p className="text-xs text-neutral-400">نوبتی نیست</p>}
                {dayAppts.slice(0, mode === "month" ? 3 : 50).map((a) => {
                  const st = APPT_STATUS[a.status] ?? { label: a.status, cls: "bg-neutral-100 text-neutral-500" };
                  return (
                    <div key={a.id} className="truncate rounded-lg bg-neutral-50 px-1.5 py-1 text-[10px] sm:px-2 sm:text-[11px] dark:bg-neutral-800">
                      <span className="font-bold text-neutral-700 dark:text-neutral-200" dir="ltr">
                        {new Date(a.startAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}
                      </span>{" "}
                      <span className="text-neutral-600 dark:text-neutral-300">{a.customerName}</span>
                      {a.employee ? <span className="text-neutral-400"> — {a.employee}</span> : null}
                      <div className="hidden items-center gap-1 text-neutral-400 sm:flex">
                        <span>{a.service ?? ""}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${st.cls}`}>{st.label}</span>
                      </div>
                    </div>
                  );
                })}
                {mode === "month" && dayAppts.length > 3 && <div className="text-[10px] text-pink-600">+{dayAppts.length - 3} مورد</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── صندوق ──────────────────────────────────────────────────────────── */

function CashForm({ ctx }: { ctx: Ctx }) {
  const [branchId, setBranchId] = useState("");
  const [cashAmount, setCashAmount] = useState(0);
  const [cardAmount, setCardAmount] = useState(0);
  const [onlineAmount, setOnlineAmount] = useState(0);
  const [expenseAmount, setExpenseAmount] = useState(0);
  async function submit() {
    const r = await ctx.api(`${ctx.base}/cash`, "POST", { branchId: branchId || undefined, cashAmount: Number(cashAmount), cardAmount: Number(cardAmount), onlineAmount: Number(onlineAmount), expenseAmount: Number(expenseAmount) }, "ثبت صندوق انجام شد ✅");
    if (r) {
      setCashAmount(0);
      setCardAmount(0);
      setOnlineAmount(0);
      setExpenseAmount(0);
      ctx.refreshCash();
    }
  }
  const totals = ctx.todayTotals;
  return (
    <div>
      {totals && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["نقدی", totals.cash, "💵"],
            ["کارت‌خوان", totals.card, "💳"],
            ["آنلاین", totals.online, "🌐"],
            ["هزینه", totals.expense, "🧾"],
            ["مانده خالص", totals.net, "💰"],
          ].map(([label, val, icon]) => (
            <div key={label as string} className="rounded-2xl border border-neutral-200 bg-white p-3 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="text-sm">{icon}</div>
              <div className="text-lg font-black text-neutral-900 dark:text-neutral-100">{Number(val).toLocaleString("fa-IR")}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
            </div>
          ))}
        </div>
      )}
      <div className={`${cardCls} grid gap-3 sm:grid-cols-6`}>
        <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">شعبه</option>
          {ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input className={inputCls} type="number" placeholder="نقدی" value={cashAmount} onChange={(e) => setCashAmount(Number(e.target.value))} />
        <input className={inputCls} type="number" placeholder="کارت‌خوان" value={cardAmount} onChange={(e) => setCardAmount(Number(e.target.value))} />
        <input className={inputCls} type="number" placeholder="آنلاین" value={onlineAmount} onChange={(e) => setOnlineAmount(Number(e.target.value))} />
        <input className={inputCls} type="number" placeholder="هزینه" value={expenseAmount} onChange={(e) => setExpenseAmount(Number(e.target.value))} />
        <button onClick={submit} className={darkBtn}>ثبت</button>
      </div>
      <DepositRefunds ctx={ctx} />
    </div>
  );
}

/* ─── بدهی بازگشت بیعانه (O2) ─────────────────────────────────────────── */

type RefundRow = {
  paymentId: string;
  appointmentId: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  gateway: string;
  note: string | null;
};

function DepositRefunds({ ctx }: { ctx: Ctx }) {
  const [due, setDue] = useState<RefundRow[]>([]);
  const [settled, setSettled] = useState<RefundRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await ctx.api<{ due?: RefundRow[]; settled?: RefundRow[] }>(`${ctx.base}/refunds`, "GET");
    if (r) {
      setDue(r.due ?? []);
      setSettled((r.settled ?? []).slice(0, 5));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.base]);

  async function settle(row: RefundRow) {
    setBusy(row.paymentId);
    const r = await ctx.api<{ summary?: { count: number; amount: number } }>(
      `${ctx.base}/refunds`,
      "POST",
      { paymentId: row.paymentId },
      `بازگشت ${row.amount.toLocaleString("fa-IR")} تومان ثبت شد ✅`
    );
    if (r) {
      await load();
      ctx.refreshCash();
    }
    setBusy(null);
  }

  if (due.length === 0 && settled.length === 0) return null;
  const totalDue = due.reduce((s, d) => s + d.amount, 0);

  return (
    <div className={`${cardCls} mt-4`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-neutral-900 dark:text-neutral-100">بدهی بازگشت بیعانه</h3>
        {totalDue > 0 && (
          <span className="rounded-lg bg-red-50 px-2 py-1 text-xs font-bold text-red-600 dark:bg-red-900/30 dark:text-red-300">
            {totalDue.toLocaleString("fa-IR")} تومان
          </span>
        )}
      </div>
      {due.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">بیعانهٔ برگشت‌خوردگانی در انتظار نیست.</p>
      ) : (
        <ul className="space-y-2">
          {due.map((row) => (
            <li key={row.paymentId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
              <span className="font-bold text-neutral-800 dark:text-neutral-200">{row.customerName}</span>
              <span className="text-neutral-500 dark:text-neutral-400" dir="ltr">{row.customerPhone}</span>
              <span className="font-black text-neutral-900 dark:text-neutral-100">{row.amount.toLocaleString("fa-IR")} تومان</span>
              <button onClick={() => settle(row)} disabled={busy === row.paymentId} className={darkBtn}>
                {busy === row.paymentId ? "…" : "بازگشت انجام شد"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {settled.length > 0 && (
        <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
          آخرین بازگشت‌های ثبت‌شده: {settled.map((s) => `${s.customerName} (${s.amount.toLocaleString("fa-IR")})`).join("، ")}
        </p>
      )}
    </div>
  );
}

/* ─── مسدودسازی ──────────────────────────────────────────────────────── */

function BlockForm({ ctx }: { ctx: Ctx }) {
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  async function submit() {
    if (!startDate || !startTime || !endDate || !endTime) {
      return ctx.setMsg({ ok: false, text: "تاریخ و ساعت شروع و پایان را انتخاب کنید" });
    }
    let startIso: string;
    let endIso: string;
    try {
      startIso = zonedTimeToIso(startDate, startTime, ctx.timezone);
      endIso = zonedTimeToIso(endDate, endTime, ctx.timezone);
    } catch (e) {
      return ctx.setMsg({ ok: false, text: e instanceof Error ? e.message : "تاریخ نامعتبر است" });
    }
    const r = await ctx.api(`${ctx.base}/blocks`, "POST", { startAt: startIso, endAt: endIso, reason: reason || undefined }, "مسدودسازی ثبت شد ✅");
    if (r) {
      setStartDate("");
      setStartTime("");
      setEndDate("");
      setEndTime("");
      setReason("");
      ctx.refreshBlocks();
    }
  }
  return (
    <div className={`${cardCls} grid gap-3 sm:grid-cols-2`}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7.5rem]">
        <JalaliDatePicker label="از تاریخ (شمسی)" value={startDate} onChange={setStartDate} timeZone={ctx.timezone} placeholder="تاریخ شروع" />
        <TimeField label="از ساعت" value={startTime} onChange={setStartTime} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_7.5rem]">
        <JalaliDatePicker label="تا تاریخ (شمسی)" value={endDate} onChange={setEndDate} timeZone={ctx.timezone} placeholder="تاریخ پایان" />
        <TimeField label="تا ساعت" value={endTime} onChange={setEndTime} />
      </div>
      <input className={inputCls} placeholder="دلیل (ناهار، تعمیرات...)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button onClick={submit} className={darkBtn}>مسدودسازی</button>
    </div>
  );
}

/* ─── ثبت نوبت دستی ──────────────────────────────────────────────────── */

function BookingForm({ ctx }: { ctx: Ctx }) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  async function submit() {
    if (!date || !time) return ctx.setMsg({ ok: false, text: "تاریخ و ساعت را انتخاب کنید" });
    let startAt: string;
    try {
      startAt = zonedTimeToIso(date, time, ctx.timezone);
    } catch (e) {
      return ctx.setMsg({ ok: false, text: e instanceof Error ? e.message : "تاریخ نامعتبر است" });
    }
    const r = await ctx.api(
      "/api/appointments",
      "POST",
      {
        salonId: ctx.salonId,
        serviceId: serviceId || undefined,
        employeeId: employeeId || undefined,
        customerName,
        customerPhone,
        startAt,
      },
      "نوبت ثبت شد ✅"
    );
    if (r) {
      setCustomerName("");
      setCustomerPhone("");
      setDate("");
      setTime("");
    }
  }
  return (
    <div className={`${cardCls} grid gap-3 sm:grid-cols-2`}>
      <input className={inputCls} placeholder="نام مشتری" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
      <input className={inputCls} placeholder="شماره موبایل" dir="ltr" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
      <select className={inputCls} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
        <option value="">انتخاب خدمت</option>
        {ctx.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
        <option value="">آرایشگر (اختیاری)</option>
        {ctx.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
        <JalaliDatePicker value={date} onChange={setDate} timeZone={ctx.timezone} placeholder="تاریخ (شمسی)" />
        <TimeField value={time} onChange={setTime} />
      </div>
      <button onClick={submit} className={`${primaryBtn} sm:col-span-2`}>
        ثبت نوبت دستی
      </button>
    </div>
  );
}

/* ─── تعطیلات استثنایی ───────────────────────────────────────────────── */

function HolidaysView({ ctx }: { ctx: Ctx }) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [date, setDate] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [openTime, setOpenTime] = useState("10:00");
  const [closeTime, setCloseTime] = useState("16:00");
  const [reason, setReason] = useState("");
  const [branchId, setBranchId] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`${ctx.base}/holidays`);
    const d = await r.json();
    if (d.success) setHolidays(d.holidays as Holiday[]);
  }, [ctx.base]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${ctx.base}/holidays`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) setHolidays(d.holidays as Holiday[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ctx.base]);

  async function add() {
    if (!date) return ctx.setMsg({ ok: false, text: "تاریخ را انتخاب کنید" });
    const r = await ctx.api(
      `${ctx.base}/holidays`,
      "POST",
      {
        date,
        isClosed,
        openTime: isClosed ? undefined : openTime,
        closeTime: isClosed ? undefined : closeTime,
        reason: reason || undefined,
        branchId: branchId || undefined,
      },
      "تعطیلی ثبت شد ✅"
    );
    if (r) {
      setDate("");
      setReason("");
      load();
    }
  }

  async function remove(id: string) {
    const r = await ctx.api(`${ctx.base}/holidays/${id}`, "DELETE", undefined, "حذف شد ✅");
    if (r) load();
  }

  return (
    <div>
      <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
        برای تعطیلی کامل سالن در یک تاریخ، یا تغییر ساعت کاری آن روز (مثلاً تعطیلات نیمه‌وقت) از این بخش استفاده کنید.
      </p>
      <div className={`${cardCls} grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]`}>
        <JalaliDatePicker value={date} onChange={setDate} timeZone={ctx.timezone} placeholder="تاریخ (شمسی)" />
        <input className={inputCls} placeholder="دلیل (اختیاری)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <select className={inputCls} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">کل سالن</option>
          {ctx.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-pink-600" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />
          تعطیل کامل
        </label>
        {!isClosed && (
          <>
            <TimeField label="از ساعت" value={openTime} onChange={setOpenTime} />
            <TimeField label="تا ساعت" value={closeTime} onChange={setCloseTime} />
          </>
        )}
        <button onClick={add} className={darkBtn}>
          افزودن
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {holidays.length === 0 && <p className="py-4 text-center text-sm text-neutral-400">تعطیلات استثنایی ثبت نشده است.</p>}
        {holidays.map((h) => (
          <div key={h.id} className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div>
              <div className="font-bold text-neutral-800 dark:text-neutral-100">{formatJalali(String(h.date).slice(0, 10))}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {h.isClosed ? "تعطیل کامل" : `ساعت ${toPersianDigits(h.openTime ?? "")} تا ${toPersianDigits(h.closeTime ?? "")}`}
                {h.branch?.name ? ` — ${h.branch.name}` : " — کل سالن"}
                {h.reason ? ` (${h.reason})` : ""}
              </div>
            </div>
            <button onClick={() => remove(h.id)} className="h-10 shrink-0 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300">
              حذف
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── مشتریان (CRM) ──────────────────────────────────────────────────── */

function CustomersView({ ctx }: { ctx: Ctx }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [q, setQ] = useState("");
  const [qParam, setQParam] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<{
    customer: { id: string; phone: string; name?: string | null; firstName?: string | null; lastName?: string | null; note?: string | null };
    appointments: CustomerAppt[];
    stats: { visits: number; completed: number; cancelled: number; noShow: number; spend: number; lastVisit: string | null };
    notes: CustomerNote[];
    media: CustomerMedia[];
    noteLimit: number;
    mediaLimit: number;
    /** سقف حجم فایل‌ها — از تنظیمات سوپرادمین (پروندهٔ مشتریان) */
    photoMaxMb?: number;
    voiceMaxMb?: number;
    mediaEnabled?: boolean;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploading, setUploading] = useState(false);

  // جستجو سمت سرور انجام می‌شود تا نتایج صفحه‌های دیگر هم گم نشوند
  useEffect(() => {
    const t = setTimeout(() => {
      setQParam(q.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [ctx.base]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (qParam) params.set("q", qParam);
    params.set("page", String(page));
    params.set("limit", "25");
    fetch(`${ctx.base}/customers?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setCustomers(d.customers as Customer[]);
          setTotal(d.total ?? 0);
          // این endpoint تنها total را برمی‌گرداند؛ تعداد صفحه‌ها اینجا محاسبه می‌شود
          setTotalPages(Math.max(1, Math.ceil((d.total ?? 0) / 25)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ctx.base, qParam, page]);

  const displayName = (c: { firstName?: string | null; lastName?: string | null; name?: string | null }) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "مشتری";

  async function openProfile(c: Customer) {
    setSelected(c);
    setLoadingDetail(true);
    setDetail(null);
    try {
      const r = await fetch(`${ctx.base}/customers/${c.id}`);
      const d = await r.json();
      if (d.success) setDetail(d);
      else ctx.setMsg({ ok: false, text: d.error || "خطا" });
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در بارگذاری پرونده" });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function addNote() {
    const t = noteText.trim();
    if (!t || !selected) return;
    setSavingNote(true);
    const r = await ctx.api(`${ctx.base}/customers/${selected.id}/notes`, "POST", { note: t }, "یادداشت اضافه شد ✅");
    if (r) {
      setNoteText("");
      openProfile(selected);
    }
    setSavingNote(false);
  }

  async function deleteNote(noteId: string) {
    if (!selected) return;
    const r = await ctx.api(`${ctx.base}/customers/${selected.id}/notes/${noteId}`, "DELETE", undefined, "یادداشت حذف شد ✅");
    if (r) openProfile(selected);
  }

  async function uploadMedia(file: File) {
    if (!selected) return;
    const isVoice = (file.type || "").startsWith("audio/");
    const maxMb = crmMaxMb(detail, isVoice ? "voice" : "photo");
    if (file.size > mbToBytes(maxMb)) {
      ctx.setMsg({ ok: false, text: `حجم ${isVoice ? "ویس" : "عکس"} ${sizeHintFa(maxMb)}` });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${ctx.base}/customers/${selected.id}/media`, { method: "POST", body: fd });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || "خطا");
      openProfile(selected);
    } catch (e) {
      ctx.setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا" });
    } finally {
      setUploading(false);
    }
  }

  async function deleteMedia(mediaId: string) {
    if (!selected) return;
    const r = await ctx.api(`${ctx.base}/customers/${selected.id}/media?mediaId=${encodeURIComponent(mediaId)}`, "DELETE", undefined, "فایل حذف شد ✅");
    if (r) openProfile(selected);
  }

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("fa-IR", { day: "numeric", month: "long", year: "numeric" })} — ${d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div>
      <input className={inputCls} placeholder="جستجو بر اساس نام یا شماره تلفن" value={q} onChange={(e) => setQ(e.target.value)} />

      {/* ── لیست مشتریان ─ */}
      <div className="mt-4 space-y-2">
        {customers.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">مشتری‌ای یافت نشد.</p>}
        {customers.map((c) => {
          const active = selected?.id === c.id;
          return (
            <div
              key={c.id}
              onClick={() => (active ? setSelected(null) : openProfile(c))}
              className={`cursor-pointer rounded-2xl border px-4 py-3 shadow-sm transition ${
                active ? "border-pink-400 bg-pink-50/40 dark:border-pink-500/60 dark:bg-pink-950/20" : "border-neutral-200 bg-white hover:border-pink-200 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-pink-500/40"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-neutral-800 dark:text-neutral-100">
                    {displayName(c)}{" "}
                    <span className="text-xs font-normal text-neutral-400" dir="ltr">{c.phone}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {toPersianDigits(c.visits)} نوبت · {toPersianDigits(c.completed)} مراجعه · {toPersianDigits(c.cancelled)} لغو · {toPersianDigits(c.noShow)} عدم حضور
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    هزینه‌کرد: {Number(c.spend || 0).toLocaleString("fa-IR")} تومان
                    {c.lastVisit ? ` · آخرین مراجعه: ${new Date(c.lastVisit).toLocaleDateString("fa-IR")}` : ""}
                  </div>
                  {(c.notesCount ?? 0) > 0 && <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">📝 {toPersianDigits(c.notesCount!)} یادداشت</span>}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    active ? setSelected(null) : openProfile(c);
                  }}
                  className="h-10 shrink-0 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  {active ? "بستن" : "مشاهده پرونده"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />

      {/* ── پنجره پاپ‌اپ پروفایل مشتری ─ */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <button
              onClick={() => setSelected(null)}
              className="absolute right-4 top-4 h-10 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              بستن پرونده
            </button>
              {/* آمار */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["نوبت‌ها", detail?.stats?.visits ?? 0],
                  ["انجام‌شده", detail?.stats?.completed ?? 0],
                  ["لغو", detail?.stats?.cancelled ?? 0],
                  ["عدم حضور", detail?.stats?.noShow ?? 0],
                  ["هزینه‌کرد", `${Number(detail?.stats?.spend || 0).toLocaleString("fa-IR")}`],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-neutral-50 px-3 py-2 text-center dark:bg-neutral-800">
                    <div className="text-base font-black text-neutral-900 dark:text-neutral-100">{toPersianDigits(String(v))}</div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{l}</div>
                  </div>
                ))}
              </div>

              {/* رزروهای قبلی */}
              <div className="mt-6">
                <h5 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">رزروهای قبلی</h5>
                {(detail?.appointments?.length ?? 0) === 0 ? (
                  <p className="mt-2 text-sm text-neutral-400">رزروی ثبت نشده است.</p>
                ) : (
                  <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                    {detail?.appointments?.map((a) => {
                      const st = APPT_STATUS[a.status] ?? { label: a.status, cls: "bg-neutral-100 text-neutral-500" };
                      return (
                        <div key={a.id} className="rounded-xl border border-neutral-100 px-3 py-2.5 text-sm dark:border-neutral-800">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200">{fmtDateTime(a.startAt)}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                          </div>
                          <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                            {a.service?.name ?? "بدون خدمت"}
                            {a.service?.price != null ? ` — ${Number(a.service.price).toLocaleString("fa-IR")} تومان` : ""}
                            {a.employee?.name ? ` · ${a.employee.name}` : ""}
                            {a.branch?.name ? ` · ${a.branch.name}` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* یادداشت‌ها (سقف از پنل سوپرادمین) */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">یادداشت‌ها</h5>
                  <span className="text-[11px] text-neutral-400">{toPersianDigits(detail?.notes?.length ?? 0)} / {toPersianDigits(detail?.noteLimit ?? 5)}</span>
                </div>
                <div className="mt-2 space-y-2">
                  {(detail?.notes?.length ?? 0) === 0 && <p className="text-xs text-neutral-400">یادداشتی ثبت نشده است.</p>}
                  {detail?.notes?.map((n) => (
                    <div key={n.id} className="flex items-start justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-900/20">
                      <div>
                        <p className="text-xs leading-5 text-amber-900 dark:text-amber-200">{n.note}</p>
                        <span className="text-[10px] text-amber-700/70 dark:text-amber-300/60">{fmtDateTime(n.createdAt)}</span>
                      </div>
                      <button onClick={() => deleteNote(n.id)} className="shrink-0 text-[10px] font-bold text-red-500 hover:text-red-700">
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
                {(detail?.notes?.length ?? 0) < (detail?.noteLimit ?? 5) && (
                  <div className="mt-2 flex gap-2">
                    <input
                      className={inputCls}
                      placeholder="یادداشت جدید (مثلاً حساسیت، رنگ موردعلاقه...)"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      maxLength={2000}
                    />
                    <button onClick={addNote} disabled={savingNote || !noteText.trim()} className={`${darkBtn} shrink-0 disabled:opacity-50`}>
                      {savingNote ? "..." : "افزودن"}
                    </button>
                  </div>
                )}
              </div>

              {/* عکس‌ها و صداها (سقف از پنل سوپرادمین) */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-extrabold text-neutral-800 dark:text-neutral-100">عکس‌ها و صداها</h5>
                  <span className="text-[11px] text-neutral-400">{toPersianDigits(detail?.media?.length ?? 0)} / {toPersianDigits(detail?.mediaLimit ?? 10)}</span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {detail?.media?.map((m) => (
                    <div key={m.id} className="group relative overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
                      {m.type === "photo" ? (
                        <img src={m.url} alt={m.name ?? "عکس مشتری"} className="h-24 w-full object-cover" />
                      ) : (
                        <div className="flex h-24 flex-col items-center justify-center gap-1 bg-neutral-100 px-2 dark:bg-neutral-800">
                          <span className="text-xl">🎙️</span>
                          <audio controls src={m.url} className="w-full" />
                        </div>
                      )}
                      <button
                        onClick={() => deleteMedia(m.id)}
                        className="absolute left-1 top-1 flex h-6 items-center justify-center rounded-md bg-black/65 px-1.5 text-[9px] font-bold text-white transition sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>

                {(detail?.mediaEnabled ?? true) && (detail?.media?.length ?? 0) < (detail?.mediaLimit ?? 10) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
                      {uploading ? "در حال بارگذاری..." : "📷 عکس"}
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f); e.target.value = ""; }} />
                    </label>
                    <label className="flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
                      {uploading ? "در حال بارگذاری..." : "🎙️ صدا"}
                      <input type="file" accept="audio/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMedia(f); e.target.value = ""; }} />
                    </label>
                    <span className="self-center text-[11px] text-neutral-400">
                      عکس تا {toPersianDigits(crmMaxMb(detail, "photo"))} مگابایت، ویس تا {toPersianDigits(crmMaxMb(detail, "voice"))} مگابایت — فقط در همین سالن دیده می‌شود.
                    </span>
                  </div>
                )}
                {!(detail?.mediaEnabled ?? true) && (
                  <p className="mt-2 text-[11px] leading-6 text-amber-600 dark:text-amber-400">
                    ثبت عکس و ویس در پروندهٔ مشتریان از سوی پشتیبانی غیرفعال شده است؛ یادداشت‌ها همچنان فعال‌اند.
                  </p>
                )}
              </div>
            </div>
            </div>
          )}
        </div>
  );
}

/* ─── صورتحساب‌ها ────────────────────────────────────────────────────── */

function BillingView({ ctx }: { ctx: Ctx }) {
  const { t } = useI18n();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customerName: "", customerPhone: "", description: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [ctx.base]);

  const load = useCallback(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    fetch(`${ctx.base}/invoices?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.success) {
          setInvoices(d.invoices as Invoice[]);
          setTotal(d.total ?? 0);
          setTotalPages(d.totalPages ?? Math.max(1, Math.ceil((d.total ?? 0) / 25)));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ctx.base, page]);

  useEffect(() => load(), [load]);

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`${ctx.base}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          description: form.description || undefined,
          amount: Number(form.amount.replace(/[^\d]/g, "")),
        }),
      });
      const d = await res.json();
      if (d.success) {
        setMsg({ ok: true, text: "فاکتور صادر شد و پیامک پرداخت برای مشتری ارسال شد ✅" });
        setForm({ customerName: "", customerPhone: "", description: "", amount: "" });
        setShowForm(false);
        load();
      } else {
        setMsg({ ok: false, text: d.error || "خطا در صدور فاکتور" });
      }
    } catch {
      setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(inv: Invoice) {
    if (!inv.payLink) return;
    const url = `${window.location.origin}${inv.payLink}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(inv.id);
      setTimeout(() => setCopied((c) => (c === inv.id ? null : c)), 2000);
    } catch {
      setCopied(inv.id);
      setTimeout(() => setCopied((c) => (c === inv.id ? null : c)), 2000);
    }
  }

  async function resend(inv: Invoice) {
    if (resending) return;
    setResending(inv.id);
    try {
      const res = await fetch(`${ctx.base}/invoices/${inv.id}/resend`, { method: "POST" });
      const d = await res.json();
      setMsg(d.success ? { ok: true, text: "پیامک یادآوری پرداخت ارسال شد ✅" } : { ok: false, text: d.error || "خطا در ارسال پیامک" });
    } catch {
      setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setResending(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t("invoices.title")}</p>
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">فاکتور خدماتی برای مشتری صادر کنید؛ لینک پرداخت به‌صورت خودکار پیامک می‌شود.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="h-11 w-full rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-4 text-sm font-bold text-white shadow-lg shadow-pink-500/25 transition hover:opacity-95 sm:w-auto"
        >
          {showForm ? "بستن فرم" : "🧾 صدور فاکتور جدید"}
        </button>
      </div>

      {msg && (
        <p className={`mb-3 rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"}`}>
          {msg.text}
        </p>
      )}

      {showForm && (
        <form onSubmit={createInvoice} className="mb-5 rounded-2xl border border-pink-200 bg-pink-50/50 p-4 dark:border-pink-900/40 dark:bg-pink-950/20">
          <h4 className="mb-3 text-sm font-extrabold text-neutral-800 dark:text-neutral-100">🧾 صدور فاکتور آنلاین برای مشتری</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-neutral-600 dark:text-neutral-300">نام مشتری *</label>
              <input
                value={form.customerName}
                onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                placeholder="مثلاً: سارا احمدی"
                required
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-neutral-600 dark:text-neutral-300">شماره موبایل مشتری *</label>
              <input
                value={form.customerPhone}
                onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                dir="ltr"
                inputMode="tel"
                required
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-right text-sm outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-neutral-600 dark:text-neutral-300">شرح خدمات (اختیاری)</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="مثلاً: کوتاهی و رنگ مو + کراتینه"
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-neutral-600 dark:text-neutral-300">مبلغ (تومان) *</label>
              <input
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="مثلاً: ۸۵۰٬۰۰۰"
                dir="ltr"
                inputMode="numeric"
                required
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-right text-sm outline-none focus:border-pink-400 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">📱 پس از صدور، پیامک حاوی لینک پرداخت آنلاین برای مشتری ارسال می‌شود.</p>
            <button
              type="submit"
              disabled={saving}
              className="h-11 w-full rounded-xl bg-neutral-900 px-5 text-sm font-bold text-white transition hover:bg-neutral-800 disabled:opacity-60 sm:w-auto dark:bg-neutral-100 dark:text-neutral-900"
            >
              {saving ? "در حال صدور..." : "صدور فاکتور و ارسال پیامک"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {invoices.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">{t("invoices.empty")}</p>}
        {invoices.map((i) => (
          <div key={i.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold text-neutral-800 dark:text-neutral-100" dir="ltr">{i.number}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${i.kind === "SERVICE" ? "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300" : "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300"}`}>
                  {i.kind === "SERVICE" ? "فاکتور خدماتی" : "اشتراک"}
                </span>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${i.status === "PAID" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                {INVOICE_STATUS[i.status] ?? i.status}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
              <span>{new Date(i.issuedAt).toLocaleDateString("fa-IR")}</span>
              {i.customerName && <span>👤 {i.customerName}</span>}
              {i.customerPhone && <span dir="ltr">📱 {i.customerPhone}</span>}
              {i.description && <span className="w-full sm:w-auto">📝 {i.description}</span>}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <div className="text-sm font-black text-neutral-800 dark:text-neutral-100">{Number(i.amount).toLocaleString("fa-IR")} تومان</div>
              {i.kind === "SERVICE" && i.status !== "PAID" && i.payLink && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyLink(i)}
                    className="h-10 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    {copied === i.id ? "کپی شد ✓" : "🔗 کپی لینک پرداخت"}
                  </button>
                  <button
                    onClick={() => resend(i)}
                    disabled={resending === i.id}
                    className="h-10 rounded-lg bg-purple-50 px-3 text-xs font-bold text-purple-600 transition hover:bg-purple-100 disabled:opacity-60 dark:bg-purple-900/30 dark:text-purple-300"
                  >
                    {resending === i.id ? "در حال ارسال..." : "📱 ارسال مجدد پیامک"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}

/* ─── کمپین‌ها ───────────────────────────────────────────────────────── */

/* ─── قالب‌های آماده پیامک مناسبتی ──────────────────────────────────── */

const CAMPAIGN_TEMPLATES: { icon: string; name: string; text: string }[] = [
  { icon: "🎊", name: "تبریک عید", text: "مشتری عزیز، عید شما مبارک! تیم «{salon}» بهترین آرزوها را برای شما و خانواده محترمتان دارد. منتظر دیدار شما هستیم 🌸" },
  { icon: "🏷️", name: "تخفیف ویژه", text: "خبر خوب! «{salon}» به مناسبت این هفته برای تمام خدمات ۲۰٪ تخفیف در نظر گرفته است. تا پایان هفته فرصت را از دست ندهید 🌟" },
  { icon: "🚚", name: "جابه‌جایی سالن", text: "مشتری عزیز، «{salon}» به آدرس جدید منتقل شده است. برای اطلاع از آدرس و مسیر، با ما تماس بگیرید یا به صفحه سالن سر بزنید 📍" },
  { icon: "🕐", name: "تغییر ساعات کاری", text: "مشتری عزیز، ساعات کاری «{salon}» تغییر کرده است. برای مشاهده ساعات جدید و رزرو آنلاین به صفحه سالن مراجعه کنید ⏰" },
  { icon: "🎂", name: "تبریک تولد", text: "تولدتان مبارک! «{salon}» به مناسبت روز تولد شما یک هدیه ویژه در نظر گرفته است؛ برای دریافت، هنگام مراجعه این پیامک را نشان دهید 🎁" },
  { icon: "💇‍♀️", name: "معرفی خدمت جدید", text: "خدمت جدید به «{salon}» اضافه شد! برای مشاهده جزئیات، قیمت‌ها و رزرو آنلاین به صفحه سالن سر بزنید ✨" },
  { icon: "🌙", name: "تعطیلات و بازگشایی", text: "مشتری عزیز، «{salon}» در ایام تعطیلات فعال نیست. از بازگشایی مجدد و رزرو وقت خود از طریق پیامک بعدی مطلع خواهید شد 🌙" },
  { icon: "💳", name: "یادآوری تسویه", text: "مشتری عزیز، لطفاً نسبت به تسویه حساب «{salon}» اقدام فرمایید. برای پرداخت آنلاین به پیامک فاکتور مراجعه کنید 💳" },
];

function CampaignsView({ ctx }: { ctx: Ctx }) {
  const { t } = useI18n();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("SMS");
  const [showTemplates, setShowTemplates] = useState(false);
  /** زمان ارسال زمان‌بندی‌شده (خالی = پیش‌نویس) */
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  /** مصرف پیامک/کمپین این ماه از سرور */
  const [usage, setUsage] = useState<{ planLabel?: string; sms?: { used: number; limit: number | boolean }; campaigns?: { used: number; limit: number | boolean } } | null>(null);

  // شمارش مخاطب هر چند صدم ثانیه یک‌بار اجرا می‌شود؛ ctx.api پیام موفقیت نشان می‌دهد، پس اینجا fetch خام
  const call: SegCall = useCallback(async (path, init) => {
    try {
      const res = await fetch(path, {
        method: init?.method,
        headers: { "Content-Type": "application/json" },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const data = await res.json();
      return { ok: res.ok && data?.success !== false, data };
    } catch {
      return { ok: false, data: null };
    }
  }, []);
  const seg = useSegmentBuilder(ctx.base, call);

  useEffect(() => {
    setPage(1);
  }, [ctx.base]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "25");
    const r = await fetch(`${ctx.base}/campaigns?${params.toString()}`);
    const d = await r.json();
    if (d.success) {
      setCampaigns(d.campaigns as Campaign[]);
      setTotal(d.total ?? 0);
      setTotalPages(d.totalPages ?? Math.max(1, Math.ceil((d.total ?? 0) / 25)));
      setUsage(d.usage ?? null);
    }
  }, [ctx.base, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyTemplate(tpl: { name: string; text: string }) {
    setName(tpl.name);
    setMessage(tpl.text);
    setShowTemplates(false);
    ctx.setMsg({ ok: true, text: `قالب «${tpl.name}» در فرم قرار گرفت؛ {salon} هنگام ارسال خودکار با نام سالن جایگزین می‌شود.` });
  }

  async function create() {
    if (!name || !message) return ctx.setMsg({ ok: false, text: t("campaigns.required") });
    if (Boolean(schedDate) !== Boolean(schedTime)) return ctx.setMsg({ ok: false, text: "برای زمان‌بندی، هر دو فیلد تاریخ و ساعت را پر کنید" });
    let scheduledAt: string | undefined;
    if (schedDate && schedTime) {
      try {
        scheduledAt = zonedTimeToIso(schedDate, schedTime, ctx.timezone);
      } catch {
        return ctx.setMsg({ ok: false, text: "تاریخ یا ساعت نامعتبر است" });
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) return ctx.setMsg({ ok: false, text: "زمان ارسال باید در آینده باشد" });
    }
    const r = await ctx.api(`${ctx.base}/campaigns`, "POST", { name, channel, ...seg.payload(), message, ...(scheduledAt ? { scheduledAt } : {}) }, scheduledAt ? "کمپین زمان‌بندی شد" : t("campaigns.created"));
    if (r) {
      setName("");
      setMessage("");
      setSchedDate("");
      setSchedTime("");
      load();
    }
  }

  async function run(id: string) {
    const res = await ctx.api<ApiRes<{ recipients?: number; blocked?: number; warning?: string }>>(
      `${ctx.base}/campaigns/${id}/run`,
      "POST",
      undefined,
      t("campaigns.queued"),
    );
    if (!res) return;
    const sent = Number(res.recipients ?? 0);
    const blocked = Number(res.blocked ?? 0);
    // «موفق» وقتی صفر پیامک رفته گمراه‌کننده است؛ warning/blocked سرور را نشان می‌دهیم
    if (sent === 0) ctx.setMsg({ ok: false, text: res.warning || "هیچ پیامکی ارسال نشد (سقف پلن یا مخاطب معتبر)." });
    else if (blocked > 0) ctx.setMsg({ ok: false, text: `${toPersianDigits(sent)} پیامک ارسال شد؛ ${res.warning || `${toPersianDigits(blocked)} مخاطب ارسال نشد.`}` });
    else ctx.setMsg({ ok: true, text: `${toPersianDigits(sent)} پیامک ارسال شد.` });
    load();
  }

  return (
    <div>
      <div className={`${cardCls} grid gap-3 sm:grid-cols-[1fr_1fr_auto]`}>
        <input className={inputCls} aria-label={t("campaigns.name")} placeholder={t("campaigns.name")} value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} aria-label={t("campaigns.message")} placeholder={t("campaigns.message")} value={message} onChange={(e) => setMessage(e.target.value)} />
        <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="SMS">{t("campaigns.sms")}</option>
          <option value="EMAIL">{t("campaigns.email")}</option>
        </select>
        <CampaignSegmentPanel seg={seg} labelOf={(k) => t(SEGMENT_I18N[k])} num={toPersianDigits} />
        <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
          <JalaliDatePicker value={schedDate} onChange={setSchedDate} timeZone={ctx.timezone} placeholder="زمان ارسال (اختیاری — شمسی)" />
          <TimeField value={schedTime} onChange={setSchedTime} label="ساعت ارسال" />
        </div>
        <button type="button" onClick={create} className={`${primaryBtn} sm:col-span-2`}>{t("campaigns.create")}</button>
      </div>

      {/* قالب‌های آماده مناسبتی */}
      <div className="mt-4 rounded-2xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900/50 dark:bg-purple-950/20">
        <button
          onClick={() => setShowTemplates((s) => !s)}
          className="flex w-full items-center justify-between gap-2 text-sm font-extrabold text-purple-700 dark:text-purple-300"
        >
          <span className="flex items-center gap-2">📣 قالب‌های آماده پیام مناسبتی</span>
          <span className="text-purple-400 transition">{showTemplates ? "▲" : "▼"}</span>
        </button>
        {showTemplates && (
          <>
            <p className="mt-2 text-xs leading-relaxed text-purple-600/80 dark:text-purple-300/70">
              روی هر قالب بزنید تا متنش در فرم قرار بگیرد. عبارت <b dir="ltr">{"{salon}"}</b> هنگام ارسال خودکار با نام سالن شما جایگزین می‌شود.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {CAMPAIGN_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  onClick={() => applyTemplate(tpl)}
                  className="rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-right transition hover:border-purple-400 hover:shadow-md dark:border-purple-900/60 dark:bg-neutral-900"
                >
                  <div className="flex items-center gap-1.5 text-xs font-black text-purple-700 dark:text-purple-300">
                    <span>{tpl.icon}</span> {tpl.name}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{tpl.text}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-extrabold text-neutral-700 dark:text-neutral-200">کمپین‌های این سالن</div>
        {/* مصرف واقعی این ماه از سرور (شمارش پیامک، نه تعداد ردیف‌های همین صفحه) */}
        {usage?.sms && (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            پیامک این ماه: {toPersianDigits(usage.sms.used)} /{" "}
            {typeof usage.sms.limit === "number" ? toPersianDigits(usage.sms.limit) : "نامحدود"}
            {usage.planLabel ? ` — پلن ${usage.planLabel}` : ""}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {campaigns.length === 0 && <p className="py-4 text-center text-sm text-neutral-400">{t("campaigns.empty")}</p>}
        {campaigns.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div>
              <div className="font-bold text-neutral-800 dark:text-neutral-100">{c.name}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                {CHANNEL_LABEL[c.channel] ?? c.channel} — {toPersianDigits(c.segmentSummary || "") || CAMPAIGN_SEGMENT[c.segment] || c.segment} — {CAMPAIGN_STATUS[c.status] ?? c.status} — ارسال: {toPersianDigits(c.sentCount ?? 0)}
              </div>
              {c.scheduledAt && c.status !== "SENT" && (
                <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                  📅 ارسال خودکار: {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short", timeZone: ctx.timezone || "Asia/Tehran" }).format(new Date(c.scheduledAt))}
                </div>
              )}
            </div>
            <button type="button" onClick={() => run(c.id)} className={darkBtn}>{t("campaigns.run")}</button>
          </div>
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
    </div>
  );
}

/* ─── دامنه اختصاصی ──────────────────────────────────────────────────── */

function DomainView({ ctx }: { ctx: Ctx }) {
  const { t } = useI18n();
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<{ host: string; value: string } | null>(null);

  async function init() {
    const r = await ctx.api<ApiRes<{ instructions?: { host: string; value: string } }>>(`${ctx.base}/domain`, "POST", { customDomain: domain || undefined }, t("domain.pending"));
    if (r) {
      setResult(r.instructions ?? null);
      ctx.setMsg({ ok: true, text: t("domain.pending") });
    }
  }

  async function verify() {
    const res = await ctx.api(`${ctx.base}/domain/verify`, "POST", undefined, t("domain.verified"));
    if (res) ctx.setMsg({ ok: true, text: t("domain.verified") });
  }

  return (
    <div className="space-y-3">
      <div className={`${cardCls} grid gap-3 sm:grid-cols-[1fr_auto_auto]`}>
        <input className={inputCls} aria-label={t("domain.placeholder")} dir="ltr" placeholder={t("domain.placeholder")} value={domain} onChange={(e) => setDomain(e.target.value)} />
        <button onClick={init} className={darkBtn}>{t("domain.submit")}</button>
        <button onClick={verify} className="h-11 rounded-xl bg-green-600 px-4 text-sm font-bold text-white transition hover:bg-green-700">{t("domain.verify")}</button>
      </div>
      {result && (
        <div className={`${cardCls} text-sm`}>
          <div>{t("domain.txt")}</div>
          <div className="mt-2 font-mono" dir="ltr">{`${result.host} TXT ${result.value}`}</div>
        </div>
      )}
    </div>
  );
}

/* ─── داده‌ها (خروجی/ورودی) ──────────────────────────────────────────── */

function DataView({ ctx }: { ctx: Ctx }) {
  const { t } = useI18n();
  const [importType, setImportType] = useState("customers");
  const [raw, setRaw] = useState("");

  async function importData() {
    try {
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : parsed.rows;
      const res = await ctx.api<{ created: number; updated: number; blocked?: number; warning?: string | null }>(
        `${ctx.base}/import/${importType === "customers" ? "customers" : "appointments"}`,
        "POST",
        { rows },
        t("data.imported")
      );
      if (res) ctx.setMsg({ ok: !res.warning, text: res.warning ?? t("data.imported") });
    } catch {
      ctx.setMsg({ ok: false, text: t("data.invalidJson") });
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <a className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-center text-sm font-bold text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800" href={`${ctx.base}/excel?type=appointments`}>{t("data.exportAppointments")}</a>
        <a className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-center text-sm font-bold text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800" href={`${ctx.base}/excel?type=customers`}>{t("data.exportCustomers")}</a>
      </div>

      <div className={cardCls}>
        <div className="mb-2 flex gap-2">
          <select className={inputCls} value={importType} onChange={(e) => setImportType(e.target.value)}>
            <option value="customers">{t("data.customers")}</option>
            <option value="appointments">{t("data.appointments")}</option>
          </select>
        </div>
        <textarea className={`${inputCls} min-h-[160px] font-mono`} aria-label={t("data.import")} placeholder={t("data.placeholder")} value={raw} onChange={(e) => setRaw(e.target.value)} />
        <button onClick={importData} className={`${primaryBtn} mt-3`}>{t("data.import")}</button>
      </div>
    </div>
  );
}

/* ─── ردیف خدمت ──────────────────────────────────────────────────────── */

function ServiceRow({ ctx, service }: { ctx: Ctx; service: Service }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [durationMin, setDurationMin] = useState(service.durationMin);
  const [price, setPrice] = useState(service.price);
  const [category, setCategory] = useState(service.category ?? "");
  const [bufferMin, setBufferMin] = useState(service.bufferMin ?? 0);

  async function save() {
    const r = await ctx.api(
      `${ctx.base}/services/${service.id}`,
      "PATCH",
      {
        name,
        durationMin: Number(durationMin),
        price: Number(price),
        category: category || null,
        bufferMin: Number(bufferMin),
      },
      "خدمت ویرایش شد ✅"
    );
    if (r) {
      setEditing(false);
      ctx.refreshServices();
    }
  }

  async function toggleActive() {
    await ctx.api(`${ctx.base}/services/${service.id}`, "PATCH", { isActive: !service.isActive }, service.isActive ? "خدمت غیرفعال شد" : "خدمت فعال شد ✅");
    ctx.refreshServices();
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {editing ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_100px_120px_110px_100px_auto]">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputCls} type="number" value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
          <input className={inputCls} type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          <input className={inputCls} placeholder="دسته‌بندی" value={category} onChange={(e) => setCategory(e.target.value)} />
          <input className={inputCls} type="number" placeholder="استراحت" value={bufferMin} onChange={(e) => setBufferMin(Number(e.target.value))} />
          <button onClick={save} className={primaryBtn}>ذخیره</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className={`font-bold ${service.isActive ? "text-neutral-800 dark:text-neutral-100" : "text-neutral-400 line-through"}`}>{service.name}</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {service.durationMin} دقیقه — {service.price.toLocaleString("fa-IR")} تومان
              {service.category ? " - " + service.category : ""}
              {service.bufferMin && service.bufferMin > 0 ? " - استراحت " + service.bufferMin + " دقیقه" : ""}
              {!service.isActive ? " — غیرفعال" : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(true)} className="h-10 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">ویرایش</button>
            <button onClick={toggleActive} className="h-10 rounded-lg bg-amber-50 px-3 text-xs font-bold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50">
              {service.isActive ? "غیرفعال" : "فعال‌سازی"}
            </button>
            <button onClick={() => ctx.api(`${ctx.base}/services/${service.id}`, "DELETE", undefined, "حذف شد ✅").then(ctx.refreshServices)} className="h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300">
              حذف
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ردیف کارمند ────────────────────────────────────────────────────── */

/**
 * برنامهٔ کاری کارمند در دو قالب در دیتابیس هست:
 *  آرایهٔ {day, open, close, isClosed} که همین پنل می‌نویسد و
 *  قالب قدیمیِ {days: […], open, close} که اسکریپت‌های seed ساخته‌اند.
 * هر دو به هفت ردیفِ یکسان تبدیل می‌شوند تا فرم باز شود و با ذخیره، قالب استاندارد نوشته شود.
 */
function toScheduleRows(schedule: unknown): { day: number; open: string; close: string; isClosed: boolean }[] {
  const rows = Array.from({ length: 7 }, (_, day) => ({ day, open: "09:00", close: "21:00", isClosed: false }));
  if (Array.isArray(schedule)) {
    for (const s of schedule as { day?: unknown; open?: unknown; close?: unknown; isClosed?: unknown }[]) {
      const d = Number(s?.day);
      if (!Number.isInteger(d) || d < 0 || d > 6) continue;
      rows[d] = {
        day: d,
        open: typeof s.open === "string" ? s.open : rows[d].open,
        close: typeof s.close === "string" ? s.close : rows[d].close,
        isClosed: s.isClosed === true,
      };
    }
    return rows;
  }
  if (schedule && typeof schedule === "object") {
    const legacy = schedule as { days?: unknown; open?: unknown; close?: unknown };
    const working = Array.isArray(legacy.days) ? legacy.days.map(Number) : [];
    if (!working.length || typeof legacy.open !== "string" || typeof legacy.close !== "string") return rows;
    for (const r of rows) {
      r.open = legacy.open;
      r.close = legacy.close;
      r.isClosed = !working.includes(r.day);
    }
  }
  return rows;
}

function StaffRow({ ctx, item }: { ctx: Ctx; item: StaffItem }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(() => toScheduleRows(item.schedule));
  const [serviceIds, setServiceIds] = useState<string[]>(() => (item.services ?? []).map((s) => s.id));
  const [active, setActive] = useState(item.isActive);
  const [avatarUrl, setAvatarUrl] = useState(item.avatarUrl ?? "");
  const [uploading, setUploading] = useState(false);

  async function uploadAvatar(file: File) {
    // پیش‌بررسی حجم با سقف پویای سوپرادمین (بررسی قطعی سمت سرور است)
    const { avatarMaxMb } = uploadLimitsSync();
    if (file.size > mbToBytes(avatarMaxMb)) {
      ctx.setMsg({ ok: false, text: `حجم تصویر ${sizeHintFa(avatarMaxMb)} است.` });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: fd });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || "خطا در بارگذاری تصویر");
      const r = await ctx.api(`${ctx.base}/staff/${item.id}`, "PATCH", { avatarUrl: d.url }, "تصویر کارمند ذخیره شد ✅");
      if (r) {
        setAvatarUrl(d.url);
        ctx.refreshStaff();
      }
    } catch (e) {
      ctx.setMsg({ ok: false, text: e instanceof Error ? e.message : "خطا در بارگذاری تصویر" });
    } finally {
      setUploading(false);
    }
  }

  async function saveSchedule() {
    const r = await ctx.api(`${ctx.base}/staff/${item.id}`, "PATCH", { schedule: days }, "برنامه کاری ذخیره شد ✅");
    if (r) ctx.refreshStaff();
  }

  async function saveServices() {
    const r = await ctx.api(`${ctx.base}/staff/${item.id}`, "PATCH", { serviceIds }, "خدمات کارمند ذخیره شد ✅");
    if (r) ctx.refreshStaff();
  }

  async function toggleActive() {
    const next = !active;
    const r = await ctx.api(`${ctx.base}/staff/${item.id}`, "PATCH", { isActive: next }, next ? "کارمند فعال شد ✅" : "کارمند غیرفعال شد");
    if (r) {
      setActive(next);
      ctx.refreshStaff();
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className="group relative block h-12 w-12 cursor-pointer overflow-hidden rounded-full bg-gradient-to-br from-pink-100 to-purple-100 dark:from-pink-950/40 dark:to-purple-950/40" title="تغییر تصویر">
            {avatarUrl ? (
              <img src={avatarUrl} alt={item.name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-lg font-black text-pink-600">{item.name.slice(0, 1)}</span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[9px] font-bold text-white opacity-0 transition group-hover:opacity-100">
              {uploading ? "..." : "تغییر"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = "";
              }}
            />
          </label>
          <div>
            <div className={`font-bold ${active ? "text-neutral-800 dark:text-neutral-100" : "text-neutral-400"}`}>
              {item.name} {item.title ? <span className="text-xs text-pink-600">({item.title})</span> : null}
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              {STAFF_ROLE[item.role] ?? item.role} — کمیسیون {item.commissionPercent}٪ — {item.specialties.join("، ")}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setOpen((o) => !o)} className="h-10 rounded-lg bg-neutral-100 px-3 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700">
            {open ? "بستن" : "برنامه و خدمات"}
          </button>
          <button onClick={toggleActive} className="h-10 rounded-lg bg-amber-50 px-3 text-xs font-bold text-amber-700 transition hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50">
            {active ? "غیرفعال" : "فعال‌سازی"}
          </button>
          <button onClick={() => ctx.api(`${ctx.base}/staff/${item.id}`, "DELETE", undefined, "حذف شد ✅").then(ctx.refreshStaff)} className="h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300">
            حذف
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-extrabold text-neutral-700 dark:text-neutral-200">برنامه کاری هفتگی</h4>
            <div className="space-y-1.5">
              {days.map((d, i) => (
                <div key={d.day} className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-2.5 sm:grid sm:grid-cols-[70px_1fr_1fr_58px] sm:items-center sm:gap-1.5 sm:border-0 sm:bg-transparent sm:p-0 dark:border-neutral-800 dark:bg-neutral-800/40 sm:dark:bg-transparent">
                  <div className="flex items-center justify-between gap-2 sm:block">
                    <span className="text-xs font-bold text-neutral-600 sm:text-[11px] sm:font-normal dark:text-neutral-300">{DAY_NAMES[i]}</span>
                    <label className="flex items-center gap-1 text-[10px] text-neutral-500 sm:hidden dark:text-neutral-400">
                      <input type="checkbox" className="h-5 w-5 shrink-0 accent-pink-600" checked={d.isClosed} onChange={(e) => setDays((prev) => prev.map((x) => (x.day === d.day ? { ...x, isClosed: e.target.checked } : x)))} />
                      تعطیل
                    </label>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:contents">
                    <TimeField value={d.open} disabled={d.isClosed} onChange={(v) => setDays((prev) => prev.map((x) => (x.day === d.day ? { ...x, open: v } : x)))} />
                    <TimeField value={d.close} disabled={d.isClosed} onChange={(v) => setDays((prev) => prev.map((x) => (x.day === d.day ? { ...x, close: v } : x)))} />
                  </div>
                  <label className="hidden items-center gap-1 text-[10px] text-neutral-500 sm:flex dark:text-neutral-400">
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-pink-600" checked={d.isClosed} onChange={(e) => setDays((prev) => prev.map((x) => (x.day === d.day ? { ...x, isClosed: e.target.checked } : x)))} />
                    تعطیل
                  </label>
                </div>
              ))}
            </div>
            <button onClick={saveSchedule} className="mt-2 h-10 w-full rounded-lg bg-neutral-900 px-4 text-xs font-bold text-white transition hover:bg-neutral-700 sm:w-auto dark:bg-neutral-100 dark:text-neutral-900">
              ذخیره برنامه
            </button>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-extrabold text-neutral-700 dark:text-neutral-200">خدمات قابل ارائه</h4>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-neutral-200 p-2 dark:border-neutral-800">
              {ctx.services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-pink-600"
                    checked={serviceIds.includes(s.id)}
                    onChange={(e) => setServiceIds((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)))}
                  />
                  {s.name}
                </label>
              ))}
              {ctx.services.length === 0 && <p className="text-xs text-neutral-400">ابتدا خدمت بسازید.</p>}
            </div>
            <button onClick={saveServices} className="mt-2 h-10 w-full rounded-lg bg-neutral-900 px-4 text-xs font-bold text-white transition hover:bg-neutral-700 sm:w-auto dark:bg-neutral-100 dark:text-neutral-900">
              ذخیره خدمات
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── کامپوننت اصلی ──────────────────────────────────────────────────── */

export default function SalonManager({
  salonId,
  salonSlug,
  timezone = "Asia/Tehran",
  excludeTabs = [],
}: {
  salonId: string;
  salonSlug?: string;
  timezone?: string;
  excludeTabs?: Tab[];
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("services");
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cash, setCash] = useState<{ entries: CashEntry[]; todayTotals: CashTotals | null }>({ entries: [], todayTotals: null });
  const [cashPage, setCashPage] = useState(1);
  const [cashTotalPages, setCashTotalPages] = useState(1);
  const [cashTotal, setCashTotal] = useState(0);
  const [msg, setMsg] = useState<Msg | null>(null);

  const base = `/api/dashboard/salons/${salonId}`;

  const refreshServices = useCallback(async () => {
    const r = await fetch(`${base}/services`);
    const d = await r.json();
    if (d.success) setServices(d.services as Service[]);
  }, [base]);

  const refreshStaff = useCallback(async () => {
    const r = await fetch(`${base}/staff`);
    const d = await r.json();
    if (d.success) setStaff(d.staff as StaffItem[]);
  }, [base]);

  const refreshBlocks = useCallback(async () => {
    const r = await fetch(`${base}/blocks`);
    const d = await r.json();
    if (d.success) setBlocks(d.blocks as Block[]);
  }, [base]);

  const refreshBranches = useCallback(async () => {
    const r = await fetch(`${base}/branches`);
    const d = await r.json();
    if (d.success) setBranches(d.branches as Branch[]);
  }, [base]);

  const refreshCash = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(cashPage));
    params.set("limit", "25");
    const r = await fetch(`${base}/cash?${params.toString()}`);
    const d = await r.json();
    if (d.success) {
      // جمع‌های روز (todayTotals) سمت سرور از تجمیع پایگاه داده می‌آید؛ بازسازی نکنیم
      setCash({ entries: d.entries as CashEntry[], todayTotals: (d.todayTotals ?? null) as CashTotals | null });
      setCashTotal(d.total ?? 0);
      setCashTotalPages(d.totalPages ?? Math.max(1, Math.ceil((d.total ?? 0) / 25)));
    }
  }, [base, cashPage]);

  useEffect(() => {
    setCashPage(1);
  }, [base]);

  useEffect(() => {
    void refreshCash();
  }, [refreshCash]);

  useEffect(() => {
    const load = (p: string) => fetch(`${base}${p}`).then((r) => r.json());
    Promise.all([load("/services"), load("/staff"), load("/blocks"), load("/branches")])
      .then(([s, st, b, br]) => {
        if (s.success && s.services) setServices(s.services as Service[]);
        if (st.success && st.staff) setStaff(st.staff as StaffItem[]);
        if (b.success && b.blocks) setBlocks(b.blocks as Block[]);
        if (br.success && br.branches) setBranches(br.branches as Branch[]);
      })
      .catch(() => {});
  }, [base]);

  async function api<T = ApiRes>(path: string, method: string, body?: unknown, okMsg?: string): Promise<T | null> {
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as T & { success: boolean; error?: string };
      if (!data.success) {
        setMsg({ ok: false, text: data.error || "خطا" });
        return null;
      }
      setMsg({ ok: true, text: okMsg ?? "ذخیره شد ✅" });
      return data;
    } catch {
      setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
      return null;
    }
  }

  const ctx: Ctx = {
    salonId,
    salonSlug,
    timezone,
    base,
    api,
    refreshServices,
    refreshStaff,
    refreshBlocks,
    refreshBranches,
    refreshCash,
    branches,
    staff,
    services,
    todayTotals: cash.todayTotals,
    setMsg,
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "services", label: t("manager.tabs.services"), icon: "✂️" },
    { id: "calendar", label: t("manager.tabs.calendar"), icon: "📅" },
    { id: "board", label: "برنامه روزانه", icon: "🗓️" },
    { id: "staff", label: t("manager.tabs.staff"), icon: "👥" },
    { id: "customers", label: t("manager.tabs.customers"), icon: "📇" },
    { id: "holidays", label: t("manager.tabs.holidays"), icon: "🏖️" },
    { id: "branches", label: t("manager.tabs.branches"), icon: "🏢" },
    { id: "cash", label: t("manager.tabs.cash"), icon: "💰" },
    { id: "report", label: t("manager.tabs.report"), icon: "📊" },
    { id: "waitlist", label: t("manager.tabs.waitlist"), icon: "⏳" },
    { id: "blocks", label: t("manager.tabs.blocks"), icon: "🚫" },
    { id: "invoices", label: t("manager.tabs.invoices"), icon: "🧾" },
    { id: "campaigns", label: t("manager.tabs.campaigns"), icon: "📣" },
    { id: "domain", label: t("manager.tabs.domain"), icon: "🌐" },
    { id: "data", label: t("manager.tabs.data"), icon: "📦" },
    { id: "booking", label: t("manager.tabs.booking"), icon: "➕" },
  ];

  // حذف تب‌های فیلتر شده
  const filteredTabs = tabs.filter((tb) => !excludeTabs.includes(tb.id));

  return (
    <div>
      {msg && (
        <p className={`mb-4 rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filteredTabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            aria-current={tab === tb.id ? "page" : undefined}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition sm:text-sm ${
              tab === tb.id
                ? "bg-gradient-to-l from-pink-600 to-purple-600 text-white shadow-md shadow-pink-500/25"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            }`}
          >
            <span className="text-sm leading-none">{tb.icon}</span>
            {tb.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {tab === "services" && (
          <>
            <ServiceForm ctx={ctx} />
            <div className="space-y-2">
              {services.map((s) => (
                <ServiceRow key={s.id} ctx={ctx} service={s} />
              ))}
              {services.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">هنوز خدمتی نساخته‌اید.</p>}
            </div>
          </>
        )}

        {tab === "staff" && (
          <>
            <StaffForm ctx={ctx} />
            <div className="space-y-2">
              {staff.map((s) => (
                <StaffRow key={s.id} ctx={ctx} item={s} />
              ))}
              {staff.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">هنوز کارمندی نساخته‌اید.</p>}
            </div>
          </>
        )}

        {tab === "customers" && <CustomersView ctx={ctx} />}
        {tab === "holidays" && <HolidaysView ctx={ctx} />}

        {tab === "branches" && (
          <>
            <BranchForm ctx={ctx} />
            <div className="space-y-2">
              {branches.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <div>
                    <div className="font-bold text-neutral-800 dark:text-neutral-100">{b.name}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{b.city ?? ""} {b.address ?? ""}</div>
                  </div>
                  <button onClick={() => ctx.api(`${base}/branches/${b.id}`, "DELETE", undefined, "حذف شد ✅").then(refreshBranches)} className="h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300">
                    حذف
                  </button>
                </div>
              ))}
              {branches.length === 0 && <p className="py-4 text-center text-sm text-neutral-400">هنوز شعبه‌ای نساخته‌اید.</p>}
            </div>
          </>
        )}

        {tab === "cash" && (
          <>
            <CashForm ctx={ctx} />
            <div className="mt-4 space-y-2">
              {cash.entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {e.branch?.name ?? "کل سالن"} — {new Date(e.createdAt).toLocaleString("fa-IR")}
                    {e.note ? ` — ${e.note}` : ""}
                  </div>
                  <div className="text-xs font-bold text-neutral-700 dark:text-neutral-200">
                    نقدی {e.cashAmount.toLocaleString("fa-IR")} — کارت {e.cardAmount.toLocaleString("fa-IR")} — آنلاین {e.onlineAmount.toLocaleString("fa-IR")}
                  </div>
                </div>
              ))}
            </div>

            <Pagination page={cashPage} totalPages={cashTotalPages} total={cashTotal} onChange={setCashPage} />
          </>
        )}

        {tab === "report" && <ReportView ctx={ctx} />}
        {tab === "invoices" && <BillingView ctx={ctx} />}
        {tab === "campaigns" && <CampaignsView ctx={ctx} />}
        {tab === "domain" && <DomainView ctx={ctx} />}
        {tab === "data" && <DataView ctx={ctx} />}
        {tab === "waitlist" && <WaitlistView ctx={ctx} />}
        {tab === "calendar" && <CalendarView ctx={ctx} />}
        {tab === "board" && <DailyBoard salonId={salonId} />}

        {tab === "blocks" && (
          <>
            <BlockForm ctx={ctx} />
            <div className="space-y-2">
              {blocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                  <div>
                    <div className="font-bold text-neutral-800 dark:text-neutral-100">{b.reason ?? "مسدودسازی"}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400" dir="ltr">
                      {new Date(b.startAt).toLocaleString("fa-IR")} ← {new Date(b.endAt).toLocaleString("fa-IR")}
                      {b.staff ? ` — ${b.staff.name}` : ""}
                    </div>
                  </div>
                  <button onClick={() => ctx.api(`${base}/blocks/${b.id}`, "DELETE", undefined, "حذف شد ✅").then(refreshBlocks)} className="h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 transition hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300">
                    حذف
                  </button>
                </div>
              ))}
              {blocks.length === 0 && <p className="py-4 text-center text-sm text-neutral-400">مسدودسازی ثبت نشده است.</p>}
            </div>
          </>
        )}

        {tab === "booking" && <BookingForm ctx={ctx} />}
      </div>
    </div>
  );
}
