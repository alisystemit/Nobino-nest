/**
 * سازندهٔ مشترک بخش‌بندی مخاطب کمپین.
 *
 * منطق نمایش (برچسب‌ها، متن پیش‌نمایش، تبدیل فرم به payload) این‌جا است تا
 * داشبورد کلاسیک و داشبورد مینی‌استایل یکی ببینند؛ فقط پوستهٔ JSX فرق دارد.
 * تطبیق واقعی با سرور انجام می‌شود (`lib/marketing/segments.ts`) تا «پیش‌نمایش»
 * و «ارسال» هرگز دو عدد متفاوت نشان ندهند.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const SEGMENT_KEYS = ["ALL", "RETURNING", "NEW", "RECENT", "SILENT", "VIP"] as const;
export type SegmentKey = (typeof SEGMENT_KEYS)[number];

export const SEGMENT_LABEL: Record<SegmentKey, string> = {
  ALL: "همهٔ مشتریان",
  RETURNING: "مراجعان",
  NEW: "مشتری تازه",
  RECENT: "اخیراً آمده",
  SILENT: "بدون مراجعه",
  VIP: "مشتریان ویژه",
};

export const SEGMENT_HINT: Record<SegmentKey, string> = {
  ALL: "هر کسی که حداقل یک نوبت تکمیل‌شده دارد.",
  RETURNING: "دو نوبت یا بیشتر.",
  NEW: "دقیقاً یک نوبت — فرصت خوش‌آمدگویی.",
  RECENT: "اخیراً آمده؛ برای یادآوری بعد از خدمت.",
  SILENT: "مدتی است نیامده؛ مناسب کمپین بازگشت.",
  VIP: "پرمصرف‌ها؛ سه نوبت و دو میلیون تومان خرید.",
};

/** همهٔ مقدارها رشته‌اند تا فیلد خالی با «صفر» قاطی نشود */
export type SegmentForm = {
  tags: string[];
  excludeTags: string[];
  category: string;
  staffId: string;
  minVisits: string;
  maxVisits: string;
  minSpend: string;
  maxSpend: string;
  silentDays: string;
  recentDays: string;
};

export const EMPTY_FORM: SegmentForm = {
  tags: [],
  excludeTags: [],
  category: "",
  staffId: "",
  minVisits: "",
  maxVisits: "",
  minSpend: "",
  maxSpend: "",
  silentDays: "",
  recentDays: "",
};

const num = (v: string): number | null => {
  const n = Math.trunc(Number(v));
  return v.trim() && Number.isFinite(n) ? n : null;
};
const text = (v: string): string | null => (v.trim() ? v.trim() : null);

/** فرم → بدنهٔ `filters` که بک‌اند با `parseFilters` می‌خواند */
export function filtersPayload(f: SegmentForm) {
  return {
    tags: f.tags,
    excludeTags: f.excludeTags,
    category: text(f.category),
    staffId: text(f.staffId),
    minVisits: num(f.minVisits),
    maxVisits: num(f.maxVisits),
    minSpend: num(f.minSpend),
    maxSpend: num(f.maxSpend),
    silentDays: num(f.silentDays),
    recentDays: num(f.recentDays),
  };
}

export const activeFilterCount = (f: SegmentForm): number =>
  f.tags.length +
  f.excludeTags.length +
  (text(f.category) ? 1 : 0) +
  (text(f.staffId) ? 1 : 0) +
  [f.minVisits, f.maxVisits, f.minSpend, f.maxSpend, f.silentDays, f.recentDays].filter((v) => num(v) !== null).length;

export type SegmentOption = {
  presets: { key: SegmentKey; count: number; days?: number; minVisits?: number; minSpend?: number }[];
  tags: string[];
  categories: string[];
  staff: { id: string; name: string }[];
  defaults: { silentDays: number; recentDays: number; vipMinVisits: number; vipMinSpend: number };
};

export type SegmentPreview = {
  matched: number;
  sendable: number;
  willSend: number;
  invalid: number;
  truncated: boolean;
  sample: { phone: string; name: string | null }[];
  quota: { planLabel: string; used: number; limit: number | boolean; label: string };
};

/** هر دو داشبورد هلپر fetch خودشان را دارند؛ این هوک فقط شکل نتیجه را می‌خواهد */
export type SegCall = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<{ ok: boolean; data: T | null }>;

export function useSegmentBuilder(base: string, call: SegCall) {
  const [segment, setSegment] = useState<SegmentKey>("ALL");
  const [form, setForm] = useState<SegmentForm>(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SegmentOption | null>(null);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // تابع fetch هر رندر تازه می‌شود؛ در ref نگه می‌داریم تا افکت‌ها فقط با `base` اجرا شوند
  const send = useRef(call);
  send.current = call;

  useEffect(() => {
    let alive = true;
    setOptions(null);
    void send.current<SegmentOption & { success?: boolean }>(`${base}/campaigns/segments`).then((r) => {
      if (alive && r.ok && r.data) setOptions(r.data);
    });
    return () => {
      alive = false;
    };
  }, [base, call]);

  // تایپ در فیلدها نباید هر کلید یک شمارش بفرستد؛ ۴۰۰ms تأخیر کافی است
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setPreviewing(true);
        void send.current<{ success: boolean } & SegmentPreview>(`${base}/campaigns/preview`, {
          method: "POST",
          body: { segment, filters: filtersPayload(form) },
        }).then((r) => {
          setPreviewing(false);
          if (r.ok && r.data) {
            setPreview(r.data);
            setError("");
          } else {
            setError((r.data as { error?: string } | null)?.error || "شمارش مخاطب ممکن نشد.");
          }
        });
      },
      400,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [base, segment, form]);

  const patch = useCallback((part: Partial<SegmentForm>) => setForm((f) => ({ ...f, ...part })), []);
  const toggle = useCallback((key: "tags" | "excludeTags", value: string) => {
    setForm((f) => {
      const other = key === "tags" ? "excludeTags" : "tags";
      // یک برچسب نمی‌تواند هم‌زمان «باید باشد» و «نباشد»
      return {
        ...f,
        [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
        [other]: f[other].filter((x) => x !== value),
      };
    });
  }, []);

  const reset = useCallback(() => {
    setForm(EMPTY_FORM);
    setSegment("ALL");
  }, []);

  const counts = useMemo(() => Object.fromEntries((options?.presets ?? []).map((p) => [p.key, p.count])) as Record<string, number>, [options]);

  return {
    segment,
    setSegment,
    form,
    patch,
    toggle,
    reset,
    open,
    setOpen,
    options,
    counts,
    preview,
    previewing,
    error,
    setError,
    active: activeFilterCount(form),
    payload: () => ({ segment, filters: filtersPayload(form) }),
  };
}

export type SegmentBuilder = ReturnType<typeof useSegmentBuilder>;

/** «چه کسی وارد لیست می‌شود؟» — مقدار برچسب preset در فهرست کمپین‌ها */
export function presetWithCount(key: string, counts: Record<string, number>): string {
  const label = SEGMENT_LABEL[key as SegmentKey] ?? SEGMENT_LABEL.ALL;
  const n = counts[key];
  return typeof n === "number" ? `${label} (${n})` : label;
}

/**
 * یک‌خطیِ نتیجهٔ پیش‌نمایش. `num` تبدیل رقم محلی است (faDigits در مینی،
 * toPersianDigits در پنل کلاسیک) تا اعداد با بقیهٔ صفحه هم‌شکل بمانند.
 */
export function previewNote(p: SegmentPreview | null, busy: boolean, num: (v: number) => string): string {
  if (busy && !p) return "در حال شمارش مخاطب…";
  if (!p) return "";
  const parts = [`${num(p.matched)} مخاطب مطابق`];
  if (p.sendable !== p.matched) parts.push(`${num(p.matched - p.invalid)} قابل ارسال`);
  parts.push(`${num(p.willSend)} با سهمیهٔ این ماه ارسال می‌شود`);
  if (p.invalid > 0) parts.push(`${num(p.invalid)} شمارهٔ نامعتبر`);
  if (p.truncated) parts.push("شمارش به سقف رسید");
  return parts.join(" · ");
}
