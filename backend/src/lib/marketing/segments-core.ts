/**
 * منطق خالص بخش‌بندی مخاطب کمپین.
 *
 * چرا از `segments.ts` جداست؟ این فایل نه Prisma می‌شناسد نه دیتابیس، پس
 * `scripts/segments.test.mjs` مستقیم از `backend/dist/lib` آن را می‌سنجد و
 * «پیش‌نمایش مخاطب» با «ارسال واقعی» دقیقاً همان تطبیق را می‌بینند — اگر این دو
 * مسیر جدا بروند، عددی که سالن می‌بیند با عددی که پیامک می‌شود فرق می‌کند.
 */

export const SEGMENT_KEYS = ["ALL", "RETURNING", "NEW", "RECENT", "SILENT", "VIP"] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number];

export const DEFAULT_SILENT_DAYS = 60;
export const DEFAULT_RECENT_DAYS = 14;
export const VIP_MIN_VISITS = 3;
export const VIP_MIN_SPEND = 2_000_000;

/** معیارهای دستی؛ `null` یعنی «محدود نکن» */
export type SegmentFilters = {
  tags: string[];
  excludeTags: string[];
  category: string | null;
  staffId: string | null;
  minVisits: number | null;
  maxVisits: number | null;
  minSpend: number | null;
  maxSpend: number | null;
  silentDays: number | null;
  recentDays: number | null;
};

export const EMPTY_FILTERS: SegmentFilters = {
  tags: [],
  excludeTags: [],
  category: null,
  staffId: null,
  minVisits: null,
  maxVisits: null,
  minSpend: null,
  maxSpend: null,
  silentDays: null,
  recentDays: null,
};

const numOf = (v: unknown, min: number, max: number): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
};
const strOf = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};
const listOf = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => strOf(x, 40)).filter((x): x is string => Boolean(x)))].slice(0, max) : [];

/** ورودی قدیمی/دستی ممکن است `undefined` یا رشته باشد؛ هیچ‌وقت نباید کمپین را بشکند */
export function parseFilters(input: unknown): SegmentFilters {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    tags: listOf(raw.tags, 20),
    excludeTags: listOf(raw.excludeTags, 20),
    category: strOf(raw.category, 60),
    staffId: strOf(raw.staffId, 40),
    minVisits: numOf(raw.minVisits, 0, 9999),
    maxVisits: numOf(raw.maxVisits, 0, 9999),
    minSpend: numOf(raw.minSpend, 0, 1_000_000_000),
    maxSpend: numOf(raw.maxSpend, 0, 1_000_000_000),
    silentDays: numOf(raw.silentDays, 7, 3650),
    recentDays: numOf(raw.recentDays, 1, 365),
  };
}

export const isEmptyFilters = (f: SegmentFilters): boolean =>
  !f.tags.length &&
  !f.excludeTags.length &&
  !f.category &&
  !f.staffId &&
  [f.minVisits, f.maxVisits, f.minSpend, f.maxSpend, f.silentDays, f.recentDays].every((v) => v === null);

export type CustomerFact = {
  phone: string;
  name: string | null;
  tags: string[];
  visits: number;
  spend: number;
  /** epoch ms آخرین نوبت تکمیل‌شده */
  lastVisitAt: number | null;
  categories: string[];
  staffIds: string[];
};

const DAY = 86_400_000;

/** شمارهٔ قابل ارسال، همان قاعدهٔ قدیمیِ مسیر کمپین */
export const isSendablePhone = (phone: string): boolean => /^0?9\d{9}$/.test(phone);

export function matchCustomer(fact: CustomerFact, segment: SegmentKey, f: SegmentFilters, now: number): boolean {
  const last = fact.lastVisitAt;

  switch (segment) {
    case "RETURNING":
      if (fact.visits < 2) return false;
      break;
    case "NEW":
      if (fact.visits !== 1) return false;
      break;
    case "RECENT": {
      const window = f.recentDays ?? DEFAULT_RECENT_DAYS;
      if (last === null || last < now - window * DAY) return false;
      break;
    }
    case "SILENT": {
      const window = f.silentDays ?? DEFAULT_SILENT_DAYS;
      if (last === null || last > now - window * DAY) return false;
      break;
    }
    case "VIP":
      if (fact.visits < Math.max(VIP_MIN_VISITS, f.minVisits ?? 0)) return false;
      if (fact.spend < Math.max(VIP_MIN_SPEND, f.minSpend ?? 0)) return false;
      break;
    default:
      if (fact.visits < 1) return false;
  }

  // VIP سقف visits/spend خودش را اعمال کرده؛ تکرارش خطا نیست ولی روشن‌تر اینجاست
  if (segment !== "VIP") {
    if (f.minVisits !== null && fact.visits < f.minVisits) return false;
    if (f.maxVisits !== null && fact.visits > f.maxVisits) return false;
    if (f.minSpend !== null && fact.spend < f.minSpend) return false;
    if (f.maxSpend !== null && fact.spend > f.maxSpend) return false;
  }

  if (f.tags.length && !f.tags.some((t) => fact.tags.includes(t))) return false;
  if (f.excludeTags.length && f.excludeTags.some((t) => fact.tags.includes(t))) return false;
  if (f.category && !fact.categories.includes(f.category)) return false;
  if (f.staffId && !fact.staffIds.includes(f.staffId)) return false;
  return true;
}

/** خلاصهٔ فارسی برای فهرست کمپین‌ها (ارقام لاتین؛ UI با faDigits تبدیل می‌کند) */
export function segmentSummary(segment: string, f: SegmentFilters): string {
  const NAMES: Record<SegmentKey, string> = {
    ALL: "همهٔ مشتریان",
    RETURNING: "مراجعان",
    NEW: "مشتری تازه",
    RECENT: "اخیراً آمده",
    SILENT: "بدون مراجعه",
    VIP: "مشتریان ویژه",
  };
  const key = (SEGMENT_KEYS as readonly string[]).includes(segment) ? (segment as SegmentKey) : "ALL";
  const parts: string[] = [NAMES[key]];
  if (key === "SILENT") parts.push(`+${f.silentDays ?? DEFAULT_SILENT_DAYS} روز سکوت`);
  if (key === "RECENT") parts.push(`در ${f.recentDays ?? DEFAULT_RECENT_DAYS} روز اخیر`);
  if (f.tags.length) parts.push(`برچسب: ${f.tags.join("، ")}`);
  if (f.excludeTags.length) parts.push(`بدون: ${f.excludeTags.join("، ")}`);
  if (f.category) parts.push(`خدمت: ${f.category}`);
  if (f.staffId) parts.push("آرایشگر مشخص");
  if (f.minVisits !== null || f.maxVisits !== null) parts.push(`نوبت ${f.minVisits ?? 0} تا ${f.maxVisits ?? "∞"}`);
  if (f.minSpend !== null || f.maxSpend !== null) parts.push(`خرید ${(f.minSpend ?? 0).toLocaleString("en-US")} تا ${(f.maxSpend ?? 0).toLocaleString("en-US")}`);
  return parts.join(" · ");
}
