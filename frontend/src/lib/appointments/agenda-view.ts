import { toPersianDigits } from "../time/jalali.ts";

/**
 * توابع خالص «نمایش روز» برای صفحهٔ نوبت‌ها — بدون Prisma/React تا هم در کامپوننت
 * کلاینت استفاده شود و هم با `node --test` قابل تست باشد.
 * مبنای ساعت، منطقهٔ زمانی خودِ نوبت/سالن است (`salonTimezone`).
 */

export type AgendaItem = {
  id: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  endAt: string;
  status: string;
  channel: string;
  service: string | null;
  serviceId: string | null;
  servicePrice: number | null;
  employee: string | null;
  employeeId: string | null;
  branchId: string | null;
  note: string | null;
  depositAmount: number | null;
  depositPaid: boolean;
  salonId: string;
  salonName: string | null;
  salonSlug: string | null;
  salonTimezone: string | null;
};

export const STATUS_META: Record<string, { label: string; dot: string; chip: string; bar: string }> = {
  REQUESTED: {
    label: "در انتظار تأیید",
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    bar: "bg-amber-400",
  },
  CONFIRMED: {
    label: "تأیید شده",
    dot: "bg-emerald-500",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    bar: "bg-emerald-500",
  },
  COMPLETED: {
    label: "انجام شده",
    dot: "bg-sky-500",
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    bar: "bg-sky-500",
  },
  CANCELLED: {
    label: "لغو شده",
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
    bar: "bg-red-400",
  },
  NO_SHOW: {
    label: "مراجعه نکرد",
    dot: "bg-neutral-400",
    chip: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
    bar: "bg-neutral-400",
  },
};

export const CHANNEL_META: Record<string, { label: string; icon: string }> = {
  VOICE: { label: "صوتی", icon: "🎙️" },
  MANUAL: { label: "دستی", icon: "✍️" },
  WEBAPP: { label: "آنلاین", icon: "🌐" },
};

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, dot: "bg-neutral-400", chip: "bg-neutral-100 text-neutral-600", bar: "bg-neutral-300" };
}

export function tzOf(item: AgendaItem, fallback: string): string {
  return item.salonTimezone || fallback;
}

/** ساعت وال‌کلوک سالن با ارقام فارسی، مثل «۱۴:۳۰» */
export function timeIn(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export function durationMin(item: AgendaItem): number {
  const ms = new Date(item.endAt).getTime() - new Date(item.startAt).getTime();
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

/** «۴۵ دقیقه» / «۱ ساعت ۲۰ دقیقه» */
export function faDuration(min: number): string {
  if (min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${toPersianDigits(m)} دقیقه`;
  if (!m) return `${toPersianDigits(h)} ساعت`;
  return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
}

/** فاصلهٔ زمانی تا یک لحظه، برای کارت «نوبت بعدی»: «۲۵ دقیقه دیگر» / «۱۰ دقیقه پیش» */
export function untilLabel(iso: string, nowMs: number): string {
  const diffMin = Math.round((new Date(iso).getTime() - nowMs) / 60000);
  if (diffMin === 0) return "هم‌اکنون";
  const abs = Math.abs(diffMin);
  // فاصله‌های بلند به نزدیک‌ترین نیم‌ساعت گرد می‌شوند تا عدد ثابت و خوانا بماند
  const body = faDuration(abs >= 90 ? Math.round(abs / 30) * 30 : abs);
  return diffMin > 0 ? `${body} دیگر` : `${body} پیش`;
}

/** نوبتی که همین حالا در حال انجام است (شامل زمان‌های لغوشده نیست) */
export function isLive(item: AgendaItem, nowMs: number): boolean {
  if (item.status === "CANCELLED" || item.status === "NO_SHOW") return false;
  return new Date(item.startAt).getTime() <= nowMs && nowMs < new Date(item.endAt).getTime();
}

export function isDone(status: string): boolean {
  return status === "COMPLETED" || status === "CANCELLED" || status === "NO_SHOW";
}

export type AgendaSplit = { live: AgendaItem[]; upcoming: AgendaItem[]; past: AgendaItem[] };

/** تقسیم روز به «جاری»، «باقی‌مانده» و «گذشته» — اساس چیدمان یک‌نگاه */
export function splitDay(items: AgendaItem[], nowMs: number): AgendaSplit {
  const live: AgendaItem[] = [];
  const upcoming: AgendaItem[] = [];
  const past: AgendaItem[] = [];
  for (const item of items) {
    const start = new Date(item.startAt).getTime();
    if (isLive(item, nowMs)) live.push(item);
    else if (start > nowMs) upcoming.push(item);
    else past.push(item);
  }
  return { live, upcoming, past };
}

/** اولین نوبتی که هنوز انجام نشده (برای هدر «نوبت بعدی») */
export function nextAppointment(items: AgendaItem[], nowMs: number): AgendaItem | null {
  const candidates = items
    .filter((i) => (i.status === "REQUESTED" || i.status === "CONFIRMED") && new Date(i.endAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return candidates[0] ?? null;
}

export type AgendaSummary = {
  total: number;
  requested: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  revenue: number;
  expected: number;
  depositPaid: number;
  depositDue: number;
  /** درصد کار انجام‌شدهٔ روز برای نوار پیشرفت */
  progress: number;
};

export function summarize(items: AgendaItem[]): AgendaSummary {
  const s: AgendaSummary = {
    total: items.length,
    requested: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    revenue: 0,
    expected: 0,
    depositPaid: 0,
    depositDue: 0,
    progress: 0,
  };
  for (const i of items) {
    if (i.status === "REQUESTED") s.requested++;
    else if (i.status === "CONFIRMED") s.confirmed++;
    else if (i.status === "COMPLETED") s.completed++;
    else if (i.status === "CANCELLED") s.cancelled++;
    else if (i.status === "NO_SHOW") s.noShow++;
    const price = i.servicePrice ?? 0;
    if (i.status === "COMPLETED") s.revenue += price;
    if (i.status === "CONFIRMED" || i.status === "REQUESTED") s.expected += price;
    if (i.depositAmount) {
      if (i.depositPaid) s.depositPaid += i.depositAmount;
      else s.depositDue += i.depositAmount;
    }
  }
  const finished = s.completed + s.cancelled + s.noShow;
  s.progress = s.total > 0 ? Math.round((finished / s.total) * 100) : 0;
  return s;
}

export function money(v: number): string {
  // جداکنندهٔ هزارگان در بعضی نسخه‌های ICU با ویرگول لاتین برمی‌گردد؛ یکدست به ٬ فارسی تبدیل می‌شود
  return `${new Intl.NumberFormat("fa-IR").format(v).replace(/,/g, "٬")} تومان`;
}

/** خلاصهٔ یک عدد با ارقام فارسی */
export function count(n: number): string {
  return toPersianDigits(n);
}
