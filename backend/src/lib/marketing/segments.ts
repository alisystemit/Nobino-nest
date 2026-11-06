/**
 * ساخت «واقعیت مشتری» از دیتابیس و تطبیق آن با بخش‌بندی کمپین.
 *
 * مخاطب از نوبت‌های **تکمیل‌شده** ساخته می‌شود (همان تعریفی که مسیر قدیمیِ ارسال
 * داشت)، و برچسب/نام از پروندهٔ `SalonCustomer` افزوده می‌شود. مسیرهای join باز
 * نگه داشته شده‌اند تا مشتریانی که هنوز پرونده ندارند هم حذف نشوند.
 */
import { prisma } from "@/lib/prisma";
import { asNumber } from "@/lib/money";
import {
  DEFAULT_RECENT_DAYS,
  DEFAULT_SILENT_DAYS,
  VIP_MIN_SPEND,
  VIP_MIN_VISITS,
  isSendablePhone,
  matchCustomer,
  parseFilters,
  SEGMENT_KEYS,
  type CustomerFact,
  type SegmentFilters,
  type SegmentKey,
} from "./segments-core";

/** سقف شمارش نوبت؛ بالاتر از این عدد «برش خورده» گزارش می‌شود تا عدد گمراه‌کننده نباشد */
const SCAN_LIMIT = 20_000;

export type AudienceResult = {
  total: number;
  /** حداکثر `cap` شمارهٔ قابل ارسال */
  recipients: string[];
  sample: { phone: string; name: string | null }[];
  truncated: boolean;
  invalid: number;
};

export async function buildCustomerFacts(salonId: string): Promise<{ facts: CustomerFact[]; truncated: boolean }> {
  const [rows, profiles] = await Promise.all([
    prisma.appointment.findMany({
      where: { salonId, status: "COMPLETED" },
      select: {
        customerPhone: true,
        customerName: true,
        startAt: true,
        employeeId: true,
        service: { select: { category: true, price: true } },
      },
      orderBy: { startAt: "desc" },
      take: SCAN_LIMIT + 1,
    }),
    prisma.salonCustomer.findMany({ where: { salonId }, select: { phone: true, name: true, tags: true } }),
  ]);

  const truncated = rows.length > SCAN_LIMIT;
  const by = new Map<string, CustomerFact>();
  for (const r of rows.slice(0, SCAN_LIMIT)) {
    const phone = (r.customerPhone || "").trim();
    if (!phone) continue;
    let fact = by.get(phone);
    if (!fact) {
      fact = { phone, name: r.customerName || null, tags: [], visits: 0, spend: 0, lastVisitAt: null, categories: [], staffIds: [] };
      by.set(phone, fact);
    }
    fact.visits += 1;
    fact.spend += r.service ? asNumber(r.service.price) : 0;
    const at = r.startAt.getTime();
    if (fact.lastVisitAt === null || at > fact.lastVisitAt) fact.lastVisitAt = at;
    if (r.service?.category && !fact.categories.includes(r.service.category)) fact.categories.push(r.service.category);
    if (r.employeeId && !fact.staffIds.includes(r.employeeId)) fact.staffIds.push(r.employeeId);
  }

  for (const p of profiles) {
    const fact = by.get(p.phone);
    if (!fact) continue;
    if (p.name) fact.name = p.name;
    fact.tags = p.tags ?? [];
  }

  return { facts: [...by.values()], truncated };
}

export function filterFacts(facts: CustomerFact[], segment: SegmentKey, filters: SegmentFilters, now = Date.now()): CustomerFact[] {
  return facts.filter((f) => matchCustomer(f, segment, filters, now));
}

/** مخاطب نهایی یک کمپین — همان تابع را پیش‌نمایش و ارسال صدا می‌زنند */
export async function resolveCampaignAudience(
  salonId: string,
  segment: string,
  rawFilters: unknown,
  cap = 500
): Promise<AudienceResult> {
  const key: SegmentKey = (SEGMENT_KEYS as readonly string[]).includes(segment) ? (segment as SegmentKey) : "ALL";
  const filters = parseFilters(rawFilters);
  const { facts, truncated } = await buildCustomerFacts(salonId);
  const matched = filterFacts(facts, key, filters);
  const sendable = matched.filter((f) => isSendablePhone(f.phone));

  return {
    total: matched.length,
    recipients: sendable.slice(0, cap).map((f) => f.phone),
    sample: matched
      .slice()
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 8)
      .map((f) => ({ phone: f.phone, name: f.name })),
    truncated,
    invalid: matched.length - sendable.length,
  };
}

export type SegmentOptions = {
  presets: { key: SegmentKey; count: number; days?: number; minVisits?: number; minSpend?: number }[];
  tags: string[];
  categories: string[];
  staff: { id: string; name: string }[];
  defaults: { silentDays: number; recentDays: number; vipMinVisits: number; vipMinSpend: number };
};

/** شمارهرهٔ preset (بدون معیار دستی) + گزینه‌های واقعی همان سالن برای فرم */
export async function segmentOptions(salonId: string): Promise<SegmentOptions> {
  const { facts } = await buildCustomerFacts(salonId);
  const now = Date.now();
  const empty: SegmentFilters = {
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

  const [services, staff] = await Promise.all([
    prisma.service.groupBy({ by: ["category"], where: { salonId, category: { not: null } }, orderBy: { category: "asc" } }),
    prisma.staff.findMany({ where: { salonId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const tags = [...new Set(facts.flatMap((f) => f.tags))].sort((a, b) => a.localeCompare(b, "fa"));

  return {
    presets: SEGMENT_KEYS.map((key) => ({
      key,
      count: facts.filter((f) => matchCustomer(f, key, empty, now)).length,
      ...(key === "SILENT" ? { days: DEFAULT_SILENT_DAYS } : {}),
      ...(key === "RECENT" ? { days: DEFAULT_RECENT_DAYS } : {}),
      ...(key === "VIP" ? { minVisits: VIP_MIN_VISITS, minSpend: VIP_MIN_SPEND } : {}),
    })),
    tags,
    categories: services.map((s) => s.category).filter((c): c is string => Boolean(c)),
    staff: staff.map((s) => ({ id: s.id, name: s.name })),
    defaults: { silentDays: DEFAULT_SILENT_DAYS, recentDays: DEFAULT_RECENT_DAYS, vipMinVisits: VIP_MIN_VISITS, vipMinSpend: VIP_MIN_SPEND },
  };
}
