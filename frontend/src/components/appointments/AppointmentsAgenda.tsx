"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "@/next";
import { usePathname, useRouter } from "@/next";
import { CalendarPlus, ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import JalaliDatePicker from "@/components/ui/JalaliDatePicker";
import RescheduleModal from "@/components/RescheduleModal";
import AppointmentCard from "./AppointmentCard";
import ActionSheet from "./ActionSheet";
import {
  isDone,
  nextAppointment,
  splitDay,
  statusMeta,
  summarize,
  timeIn,
  tzOf,
  untilLabel,
  type AgendaItem,
} from "@/lib/appointments/agenda-view";
import { dayLabel, shiftDay } from "@/lib/time/day-window";
import { formatJalaliWithWeekday, toPersianDigits } from "@/lib/time/jalali";

type Props = {
  items: AgendaItem[];
  /** روز جاری صفحه */
  dayISO: string;
  /** امروز به وقت سالن — برای دکمهٔ «امروز» و خط «الان» */
  todayISO: string;
  timezone: string;
  role: string;
  salons: { id: string; name: string }[];
  activeSalonId: string | null;
};

type StatusFilter = "" | "REQUESTED" | "CONFIRMED" | "COMPLETED" | "CLOSED";

/** دکمهٔ گرد جابه‌جایی روز/به‌روزرسانی — حداقل ۴۴px برای لمس */
const DAY_BTN =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition active:scale-95 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700";

/** نام روز هفتهٔ میلادی-شمسی، مثل «سه‌شنبه» — برچسب تقویم وقتی تاریخ دور است */
function weekdayOf(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { weekday: "long" }).format(new Date(`${iso}T12:00:00Z`));
  } catch {
    return "";
  }
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "", label: "همه" },
  { key: "REQUESTED", label: "در انتظار تأیید" },
  { key: "CONFIRMED", label: "تأیید شده" },
  { key: "COMPLETED", label: "انجام شده" },
  { key: "CLOSED", label: "لغو / عدم حضور" },
];

/**
 * برنامهٔ روز به سبک موبایل: نوار چسبانِ انتخاب روز، کارت «بعدی‌ترین نوبت»،
 * شمارش لمسی وضعیت‌ها و فهرست زمانی بزرگ‌کلی — برای اینکه آرایشگر با یک نگاه
 * بفهمد امروز چه کسی ساعت چند می‌آید و چه کاری باقی مانده است.
 */
export default function AppointmentsAgenda({ items: serverItems, dayISO, todayISO, timezone, role, salons, activeSalonId }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [patched, setPatched] = useState<Record<string, Partial<AgendaItem>>>({});
  const [filter, setFilter] = useState<StatusFilter>("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [reschedule, setReschedule] = useState<AgendaItem | null>(null);
  const [pastOpen, setPastOpen] = useState<boolean | null>(null);

  // دادهٔ سرور منبع حقیقت است؛ تغییرهای خوش‌بینانه فقط روی همان ردیف اعمال می‌شود
  const items = useMemo(
    () => serverItems.map((i) => (patched[i.id] ? { ...i, ...patched[i.id] } : i)),
    [serverItems, patched]
  );
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const isToday = dayISO === todayISO;
  const staff = role !== "CUSTOMER";

  const navigate = useCallback(
    (next: { date?: string; salon?: string | null }) => {
      const params = new URLSearchParams();
      params.set("date", next.date ?? dayISO);
      const salon = "salon" in next ? next.salon : activeSalonId;
      if (salon) params.set("salon", salon);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [activeSalonId, dayISO, pathname, router]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (filter === "CLOSED") {
        if (i.status !== "CANCELLED" && i.status !== "NO_SHOW") return false;
      } else if (filter && i.status !== filter) return false;
      if (!q) return true;
      return (
        i.customerName.toLowerCase().includes(q) ||
        i.customerPhone.includes(q) ||
        (i.service ?? "").toLowerCase().includes(q) ||
        (i.employee ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, filter, query]);

  const stats = useMemo(() => summarize(items), [items]);
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { "": items.length, REQUESTED: 0, CONFIRMED: 0, COMPLETED: 0, CLOSED: 0 };
    for (const i of items) {
      if (i.status === "REQUESTED") c.REQUESTED++;
      else if (i.status === "CONFIRMED") c.CONFIRMED++;
      else if (i.status === "COMPLETED") c.COMPLETED++;
      else if (i.status === "CANCELLED" || i.status === "NO_SHOW") c.CLOSED++;
    }
    return c;
  }, [items]);

  const spotlight = useMemo(() => (isToday ? nextAppointment(items, now) : null), [items, isToday, now]);
  const live = useMemo(() => (isToday ? items.filter((i) => !isDone(i.status) && new Date(i.startAt).getTime() <= now && now < new Date(i.endAt).getTime()) : []), [items, isToday, now]);
  const hero = live[0] ?? spotlight;
  const heroIsLive = Boolean(hero && live.length > 0 && hero.id === live[0]!.id);

  const { upcoming, past } = useMemo(() => splitDay(visible, now), [visible, now]);
  const showPast = pastOpen ?? !isToday;
  const multiSalon = useMemo(() => new Set(items.map((i) => i.salonId)).size > 1, [items]);

  async function patchStatus(id: string, status: "CONFIRMED" | "COMPLETED" | "NO_SHOW" | "CANCELLED", reason?: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(reason ? { cancelReason: reason } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!data?.success) {
        setToast({ ok: false, text: data?.error ?? "وضعیت ثبت نشد" });
        return;
      }
      setPatched((p) => ({ ...p, [id]: { status } }));
      setSheetId(null);
      setToast({ ok: true, text: `نوبت → ${statusMeta(status).label}` });
      router.refresh();
    } catch {
      setToast({ ok: false, text: "اتصال به سرور برقرار نشد" });
    } finally {
      setBusyId(null);
    }
  }

  async function customerCancel(id: string, reason: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/appointments/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!data?.success) {
        setToast({ ok: false, text: data?.error ?? "نوبت لغو نشد" });
        return;
      }
      setPatched((p) => ({ ...p, [id]: { status: "CANCELLED" } }));
      setSheetId(null);
      setToast({ ok: true, text: "نوبت لغو شد" });
      router.refresh();
    } catch {
      setToast({ ok: false, text: "اتصال به سرور برقرار نشد" });
    } finally {
      setBusyId(null);
    }
  }

  const sheetItem = sheetId ? items.find((i) => i.id === sheetId) ?? null : null;

  return (
    <div className="pb-28 sm:pb-6">
      {/* ═══ نوار روز: انتخاب تاریخ، فیلتر وضعیت، جستجو ═══ */}
      <div className="sticky top-14 z-10 -mx-4 mb-4 border-b border-neutral-200 bg-[#f3f5f9]/95 px-4 py-2.5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95 sm:mx-0 sm:rounded-2xl sm:border sm:bg-white/95 sm:px-3 sm:shadow-sm lg:top-32 dark:sm:bg-neutral-900/95">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate({ date: shiftDay(dayISO, -1) })} className={DAY_BTN} aria-label="روز قبل">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <JalaliDatePicker
              value={dayISO}
              onChange={(iso) => navigate({ date: iso })}
              timeZone={timezone}
              label={dayLabel(dayISO, todayISO, weekdayOf)}
            />
          </div>
          <button type="button" onClick={() => navigate({ date: shiftDay(dayISO, 1) })} className={DAY_BTN} aria-label="روز بعد">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => router.refresh()} className={DAY_BTN} aria-label="به‌روزرسانی">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {FILTERS.map((f) => (
            <button
              key={f.key || "all"}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={`h-11 shrink-0 inline-flex items-center rounded-full px-4 text-sm font-bold transition ${
                filter === f.key
                  ? "bg-[#1c2434] text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {f.label} <span className="opacity-70">{toPersianDigits(counts[f.key])}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSearchOpen((s) => !s)}
            aria-pressed={searchOpen}
            className={`h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-full transition ${searchOpen ? "bg-[#1c2434] text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}
            aria-label="جستجو در نوبت‌های امروز"
          >
            {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>
        </div>

        {searchOpen && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="نام، شماره، خدمت یا آرایشگر"
            autoFocus
            className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-800"
          />
        )}

        {salons.length > 1 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {salons.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => navigate({ salon: s.id })}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  s.id === activeSalonId
                    ? "border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-900/40 dark:text-pink-200"
                    : "border-neutral-200 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-3 rounded-2xl px-4 py-3 text-sm font-bold ${toast.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-200"}`}
        >
          {toast.text}
        </div>
      )}

      {/* ═══ یک نگاه: نوبت بعدی/جاری + پیشرفت روز ═══ */}
      {items.length > 0 && (
        <section className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-l from-[#1c2434] to-[#2a3450] p-4 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-white/60">
              {isToday ? "امروز" : dayLabel(dayISO, todayISO, formatJalaliWithWeekday)} · {toPersianDigits(stats.total)} نوبت
            </span>
            <span className="text-[11px] font-bold text-white/60">
              {toPersianDigits(stats.completed)} انجام شد · {toPersianDigits(stats.requested)} در انتظار
            </span>
          </div>

          {hero ? (
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-black text-pink-300">{live.length > 0 ? "هم‌اکنون در حال انجام" : "نوبت بعدی"}</div>
                <div className="mt-0.5 truncate text-xl font-black">{hero.customerName}</div>
                <div className="mt-0.5 truncate text-xs text-white/70">
                  {hero.service ?? "بدون خدمت"}
                  {hero.employee ? ` · ${hero.employee}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-left">
                <div className="text-2xl leading-none font-black">{timeIn(hero.startAt, tzOf(hero, timezone))}</div>
                <div className="mt-1 text-[11px] font-bold text-white/70">
                  {heroIsLive ? `تا ${timeIn(hero.endAt, tzOf(hero, timezone))}` : untilLabel(hero.startAt, now)}
                </div>
                <a href={`tel:${hero.customerPhone}`} className="mt-1.5 inline-flex h-10 items-center gap-1 rounded-xl bg-white/15 px-3.5 text-xs font-black backdrop-blur transition active:scale-95">
                  تماس
                </a>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm font-bold text-white/80">
              {isToday ? "نوبت باقی‌مانده‌ای برای امروز نیست — روز تمام شده است." : "در این روز نوبتی وجود ندارد."}
            </div>
          )}

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-to-l from-pink-400 to-purple-400 transition-all duration-500" style={{ width: `${stats.progress}%` }} />
          </div>
        </section>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
          <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
            {isToday ? "امروز نوبتی ثبت نشده است." : "این روز خالی است."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {staff && (
              <Link href="/dashboard/new-appointment" className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-4 text-sm font-black text-white">
                <CalendarPlus className="h-4 w-4" /> ثبت نوبت دستی
              </Link>
            )}
            <Link href={staff ? "/dashboard/voice-booking" : "/salons"} className="inline-flex h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-bold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              {staff ? "رزرو صوتی" : "جستجوی سالن"}
            </Link>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400 dark:border-neutral-700">
          نوبتی با این فیلتر یا جستجو پیدا نشد.
        </p>
      ) : (
        <>
          {/* در حال انجام */}
          {live.length > 0 && (
            <div className="mb-4">
              <SectionTitle tone="pink">هم‌اکنون روی صندلی</SectionTitle>
              <List>
                {live.map((i) => (
                  <AppointmentCard
                    key={i.id}
                    item={i}
                    timezone={timezone}
                    role={role}
                    nowMs={now}
                    highlight="live"
                    showSalon={multiSalon}
                    busy={busyId === i.id}
                    onStatus={(s) => patchStatus(i.id, s)}
                    onSheet={() => setSheetId(i.id)}
                  />
                ))}
              </List>
            </div>
          )}

          {/* باقی‌ماندهٔ روز */}
          {upcoming.length > 0 && (
            <div className="mb-4">
              <SectionTitle>{isToday ? "باقی‌ماندهٔ امروز" : "نوبت‌های این روز"}</SectionTitle>
              <List>
                {upcoming.map((i) => (
                  <AppointmentCard
                    key={i.id}
                    item={i}
                    timezone={timezone}
                    role={role}
                    nowMs={now}
                    highlight={hero?.id === i.id ? "next" : null}
                    showSalon={multiSalon}
                    busy={busyId === i.id}
                    onStatus={(s) => patchStatus(i.id, s)}
                    onSheet={() => setSheetId(i.id)}
                  />
                ))}
              </List>
            </div>
          )}

          {/* گذشته */}
          {past.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setPastOpen(!showPast)}
                className="mb-2 flex w-full items-center justify-between rounded-xl bg-neutral-100 px-3 py-2.5 text-xs font-black text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                aria-expanded={showPast}
              >
                <span>
                  گذشتهٔ روز — {toPersianDigits(past.length)} نوبت
                </span>
                <span>{showPast ? "بستن" : "نمایش"}</span>
              </button>
              {showPast && (
                <List>
                  {past.map((i) => (
                    <AppointmentCard
                      key={i.id}
                      item={i}
                      timezone={timezone}
                      role={role}
                      nowMs={now}
                      showSalon={multiSalon}
                      busy={busyId === i.id}
                      onStatus={(s) => patchStatus(i.id, s)}
                      onSheet={() => setSheetId(i.id)}
                    />
                  ))}
                </List>
              )}
            </div>
          )}

          {upcoming.length === 0 && past.length === 0 && live.length === 0 && (
            <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400 dark:border-neutral-700">نوبتی برای نمایش نیست.</p>
          )}
        </>
      )}

      {sheetItem && (
        <ActionSheet
          item={sheetItem}
          timezone={timezone}
          role={role}
          busy={busyId === sheetItem.id}
          onClose={() => setSheetId(null)}
          onStatus={(status, reason) => patchStatus(sheetItem.id, status, reason)}
          onReschedule={() => {
            setReschedule(sheetItem);
            setSheetId(null);
          }}
          onCustomerCancel={(reason) => customerCancel(sheetItem.id, reason)}
        />
      )}

      {reschedule && (
        <RescheduleModal
          appointmentId={reschedule.id}
          salonSlug={reschedule.salonSlug}
          serviceId={reschedule.serviceId}
          employeeId={reschedule.employeeId}
          branchId={reschedule.branchId}
          timezone={reschedule.salonTimezone}
          onClose={() => setReschedule(null)}
          onDone={(text) => {
            setReschedule(null);
            setToast({ ok: true, text });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function SectionTitle({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "pink" }) {
  return (
    <h2 className={`mb-2 text-xs font-black tracking-wide ${tone === "pink" ? "text-pink-600 dark:text-pink-400" : "text-neutral-500 dark:text-neutral-400"}`}>
      {children}
    </h2>
  );
}
