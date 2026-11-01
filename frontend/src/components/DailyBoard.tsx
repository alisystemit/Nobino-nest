"use client";

import { useEffect, useMemo, useState } from "react";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";
import { toPersianDigits } from "@/lib/utils";

type Row = {
  id: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  endAt?: string;
  status: string;
  channel?: string;
  service?: string;
  servicePrice?: number;
  employee?: string;
  note?: string | null;
  depositAmount?: number | null;
  depositPaid?: boolean;
  salonTimezone?: string;
};

const STATUS: Record<string, { label: string; cls: string }> = {
  REQUESTED: { label: "در انتظار", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  CONFIRMED: { label: "تأییدشده", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  COMPLETED: { label: "انجام‌شده", cls: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  CANCELLED: { label: "لغو", cls: "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300" },
  NO_SHOW: { label: "عدم حضور", cls: "bg-neutral-100 text-neutral-500 dark:bg-neutral-800" },
};

const CHANNEL: Record<string, string> = {
  VOICE: "🎙️ صوتی",
  MANUAL: "☎️ دستی",
  WEBAPP: "🌐 آنلاین",
};

type ReminderWindow = { window: string; status: "SENT" | "PENDING" | "FAILED" | "NOT_QUEUED"; attempts: number; lastError: string | null; sentAt: string | null };
type ReminderItem = {
  id: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  status: string;
  windows: ReminderWindow[];
  problem: "FAILED" | "NOT_QUEUED" | "PENDING" | null;
};

const WINDOW_LABEL: Record<string, string> = { "24h": "۲۴ ساعت قبل", "2h": "۲ ساعت قبل", "1h": "۱ ساعت قبل" };

function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatTime(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

function durationMinutes(row: Row): number | null {
  if (!row.endAt) return null;
  const ms = new Date(row.endAt).getTime() - new Date(row.startAt).getTime();
  return ms > 0 ? Math.round(ms / 60000) : null;
}

/**
 * برنامه روزانه سالن: مشتریان هر قسمت/خدمت که از قبل رزرو کرده‌اند،
 * با شماره، زمان حضور، زمان پایان، پیش‌پرداخت و وضعیت — برای برنامه‌ریزی بهتر.
 */
export default function DailyBoard({ salonId }: { salonId: string }) {
  const [date, setDate] = useState(() => todayIn("Asia/Tehran"));
  const [rows, setRows] = useState<Row[]>([]);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        setLoading(true);
        setError("");
        return Promise.all([
          fetch(`/api/appointments?from=${date}&to=${date}`).then((r) => r.json()),
          fetch(`/api/dashboard/salons/${salonId}/reminders?date=${date}`).then((r) => r.json()),
        ]);
      })
      .then(([d, rem]) => {
        if (cancelled) return;
        if (!d.success) throw new Error(d.error || "خطا در دریافت نوبت‌ها");
        setRows(d.appointments ?? []);
        if (rem.success && Array.isArray(rem.items)) setReminders(rem.items as ReminderItem[]);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "خطا در دریافت نوبت‌ها");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, salonId]);

  const timezone = rows[0]?.salonTimezone ?? "Asia/Tehran";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.customerName.toLowerCase().includes(q) ||
        r.customerPhone.includes(q) ||
        (r.service ?? "").toLowerCase().includes(q) ||
        (r.employee ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, statusFilter, query]);

  // گروه‌بندی بر اساس خدمت
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const key = r.service || "بدون خدمت";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[1][0]!.startAt.localeCompare(b[1][0]!.startAt));
  }, [filtered]);

  const stats = useMemo(() => {
    const total = rows.length;
    const confirmed = rows.filter((r) => r.status === "CONFIRMED").length;
    const completed = rows.filter((r) => r.status === "COMPLETED").length;
    const cancelled = rows.filter((r) => r.status === "CANCELLED" || r.status === "NO_SHOW").length;
    const revenue = rows.reduce((s, r) => s + (r.status === "COMPLETED" ? r.servicePrice ?? 0 : 0), 0);
    const depositTotal = rows.reduce((s, r) => s + (r.depositAmount ?? 0), 0);
    const depositPaid = rows.reduce((s, r) => s + (r.depositPaid ? r.depositAmount ?? 0 : 0), 0);
    return { total, confirmed, completed, cancelled, revenue, depositTotal, depositPaid };
  }, [rows]);

  const reminderByAppt = useMemo(() => new Map(reminders.map((r) => [r.id, r])), [reminders]);

  const reminderProblems = useMemo(() => {
    const failed = reminders.filter((r) => r.problem === "FAILED");
    const notQueued = reminders.filter((r) => r.problem === "NOT_QUEUED");
    const pending = reminders.filter((r) => r.problem === "PENDING");
    return { failed, notQueued, pending };
  }, [reminders]);

  const cards = [
    { label: "کل نوبت‌ها", value: toPersianDigits(stats.total), icon: "📋", cls: "text-neutral-900 dark:text-neutral-100" },
    { label: "تأییدشده", value: toPersianDigits(stats.confirmed), icon: "✅", cls: "text-emerald-600" },
    { label: "انجام‌شده", value: toPersianDigits(stats.completed), icon: "💫", cls: "text-sky-600" },
    { label: "لغو/عدم حضور", value: toPersianDigits(stats.cancelled), icon: "❌", cls: "text-red-500" },
    {
      label: "درآمد انجام‌شده",
      value: `${stats.revenue.toLocaleString("fa-IR")} ت`,
      icon: "💰",
      cls: "text-pink-600",
    },
    {
      label: "بیعانه دریافت‌شده",
      value: `${stats.depositPaid.toLocaleString("fa-IR")} از ${stats.depositTotal.toLocaleString("fa-IR")}`,
      icon: "🧾",
      cls: "text-amber-600",
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-56">
          <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">تاریخ (شمسی)</label>
          <JalaliDatePicker
            className="mt-1 w-full"
            value={date}
            onChange={setDate}
            timeZone={timezone}
          />
        </div>
        <div className="min-w-[150px] flex-1">
          <label className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">جستجو</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="نام، شماره، خدمت یا آرایشگر"
            className="mt-1 h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm outline-none focus:border-pink-500 sm:w-auto dark:border-neutral-700 dark:bg-neutral-800"
          aria-label="فیلتر وضعیت"
        >
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-base">{c.icon}</div>
            <div className={`mt-1 text-sm font-black ${c.cls}`}>{c.value}</div>
            <div className="text-[10px] text-neutral-500">{c.label}</div>
          </div>
        ))}
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">{error}</p>}

      {(reminderProblems.failed.length > 0 || reminderProblems.notQueued.length > 0 || reminderProblems.pending.length > 0) && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 font-extrabold text-amber-800 dark:text-amber-300">🔔 توجه: یادآوری پیامکی</div>
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-200/80">
            {reminderProblems.failed.length > 0 && `${toPersianDigits(reminderProblems.failed.length)} یادآوری ناموفق ارسال شده است.`}
            {reminderProblems.notQueued.length > 0 && `${reminderProblems.failed.length > 0 ? " " : ""}${toPersianDigits(reminderProblems.notQueued.length)} نوبت هنوز یادآوری دریافت نکرده است.`}
            {reminderProblems.pending.length > 0 && `${reminderProblems.failed.length + reminderProblems.notQueued.length > 0 ? " " : ""}${toPersianDigits(reminderProblems.pending.length)} یادآوری در صف ارسال است.`}
            {" لطفاً با مشتری تماس بگیرید:"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...reminderProblems.failed, ...reminderProblems.notQueued].map((r) => (
              <span key={r.id} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-800 shadow-sm dark:bg-amber-900/40 dark:text-amber-200">
                {r.customerName} — {formatTime(r.startAt, timezone)}
                <a href={`tel:${r.customerPhone}`} dir="ltr" className="mr-1 text-pink-600 hover:underline">{toPersianDigits(r.customerPhone)}</a>
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-neutral-400">در حال بارگیری...</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-neutral-400">
          {rows.length === 0 ? "برای این روز نوبتی ثبت نشده است." : "نوبتی با این فیلتر پیدا نشد."}
        </p>
      ) : (
        <div className="space-y-5">
          {groups.map(([service, list]) => {
            const groupRevenue = list.reduce((s, r) => s + (r.status === "COMPLETED" ? r.servicePrice ?? 0 : 0), 0);
            const groupPrepaid = list.reduce((s, r) => s + (r.depositPaid ? r.depositAmount ?? 0 : 0), 0);
            return (
              <div key={service} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-extrabold text-neutral-900 dark:text-neutral-100">💇 {service}</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
                      {toPersianDigits(list.length)} نوبت
                    </span>
                    {groupRevenue > 0 && (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        درآمد {groupRevenue.toLocaleString("fa-IR")}
                      </span>
                    )}
                    {groupPrepaid > 0 && (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                        بیعانه {groupPrepaid.toLocaleString("fa-IR")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  {list.map((r) => {
                    const dur = durationMinutes(r);
                    return (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2.5 dark:border-neutral-800">
                        <div className="flex items-start gap-3">
                          <div className="min-w-[64px] text-center">
                            <span className="block text-sm font-black text-neutral-800 dark:text-neutral-100">
                              {formatTime(r.startAt, timezone)}
                            </span>
                            {r.endAt && (
                              <span className="block text-[10px] text-neutral-400">{formatTime(r.endAt, timezone)}</span>
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
                              {r.customerName}{" "}
                              <a href={`tel:${r.customerPhone}`} className="text-xs font-normal text-neutral-400 hover:text-pink-600" dir="ltr">
                                {toPersianDigits(r.customerPhone)}
                              </a>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                              {r.employee && <span>✂️ {r.employee}</span>}
                              {dur && <span>⏱ {toPersianDigits(dur)} دقیقه</span>}
                              {r.channel && <span>{CHANNEL[r.channel] ?? r.channel}</span>}
                              {r.servicePrice ? <span>💵 {r.servicePrice.toLocaleString("fa-IR")} تومان</span> : null}
                            </div>
                            {r.note && <div className="mt-1 text-[11px] text-neutral-400">📝 {r.note}</div>}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {(() => {
                            const rem = reminderByAppt.get(r.id);
                            if (!rem) return null;
                            const cls =
                              rem.problem === "FAILED"
                                ? "bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300"
                                : rem.problem === "NOT_QUEUED"
                                  ? "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                                  : rem.problem === "PENDING"
                                    ? "bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
                                    : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300";
                            const title = rem.windows
                              .map((w) => `${WINDOW_LABEL[w.window] ?? w.window}: ${w.status === "SENT" ? "ارسال شد" : w.status === "FAILED" ? "ناموفق" : w.status === "PENDING" ? "در صف" : "ارسال نشده"}`)
                              .join(" | ");
                            return (
                              <span title={title} className={`cursor-help rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>
                                🔔 {rem.problem === null ? "یادآوری OK" : "یادآوری!"}
                              </span>
                            );
                          })()}
                          {r.depositAmount ? (
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${r.depositPaid ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                              بیعانه {r.depositAmount.toLocaleString("fa-IR")} {r.depositPaid ? "✓" : "—"}
                            </span>
                          ) : null}
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[r.status]?.cls ?? "bg-neutral-100 text-neutral-500"}`}>
                            {STATUS[r.status]?.label ?? r.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
