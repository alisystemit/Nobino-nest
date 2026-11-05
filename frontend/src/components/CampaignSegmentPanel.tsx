/**
 * پنل بخش‌بندی مخاطب کمپین — نسخهٔ پنل کلاسیک (Tailwind).
 *
 * حالت و داده از همان `useSegmentBuilder` می‌آید که داشبورد مینی هم استفاده
 * می‌کند؛ این فایل فقط چیدمان Tailwind است. شمارش مخاطب از سرور می‌آید تا
 * عددی که سالن می‌بیند همان عددی باشد که `/campaigns/:id/run` ارسال می‌کند.
 */
import { previewNote, SEGMENT_HINT, SEGMENT_KEYS, type SegmentBuilder } from "@/lib/campaign-segments";

const chipCls = (on: boolean) =>
  `h-9 rounded-xl border px-3 text-xs font-bold transition ${
    on
      ? "border-purple-500 bg-purple-50 text-purple-700 dark:border-purple-500 dark:bg-purple-950/40 dark:text-purple-200"
      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
  }`;

const boxCls = "rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300";

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">{label}</span>
      {children}
    </label>
  );
}

export function CampaignSegmentPanel({
  seg,
  labelOf,
  num,
}: {
  seg: SegmentBuilder;
  labelOf: (key: (typeof SEGMENT_KEYS)[number]) => string;
  num: (v: number) => string;
}) {
  const { options, form, patch, preview, previewing, error, counts } = seg;

  return (
    <div className="grid gap-2 sm:col-span-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="بخش هدف کمپین">
        {SEGMENT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={chipCls(seg.segment === key)}
            aria-pressed={seg.segment === key}
            aria-label={`${labelOf(key)}، ${num(counts[key] ?? 0)} مشتری`}
            onClick={() => seg.setSegment(key)}
          >
            {labelOf(key)}
            {typeof counts[key] === "number" ? <span className="ms-1.5 font-black">· {num(counts[key])}</span> : null}
          </button>
        ))}
      </div>

      <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{SEGMENT_HINT[seg.segment]}</p>

      <button
        type="button"
        onClick={() => seg.setOpen((v) => !v)}
        aria-expanded={seg.open}
        className="flex h-10 items-center justify-between rounded-xl border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-700 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
      >
        <span>معیارهای دقیق{seg.active > 0 ? ` (${num(seg.active)})` : ""}</span>
        <span aria-hidden="true">{seg.open ? "▲" : "▼"}</span>
      </button>

      {/* شمارش زنده از سرور؛ تغییرش باید برای صفحه‌خوان اعلام شود */}
      <div className={boxCls} aria-live="polite">
        <span>{error || previewNote(preview, previewing, num) || "در حال شمارش مخاطب…"}</span>
        {preview && preview.sample.length > 0 ? (
          <span className="mt-1 block break-words text-[11px] text-neutral-500 dark:text-neutral-400">
            نمونه: {preview.sample.map((s) => s.name || s.phone).join("، ")}
          </span>
        ) : null}
      </div>

      {seg.open ? (
        <div className="grid gap-3 rounded-2xl border border-neutral-200 p-3 sm:grid-cols-2 dark:border-neutral-800">
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">فقط با این برچسب‌ها</p>
            {(options?.tags ?? []).length === 0 ? (
              <p className="text-[11px] text-neutral-400">برچسبی برای مشتریان این سالن ثبت نشده است.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="فقط با این برچسب‌ها">
                {options?.tags.map((v) => (
                  <button key={v} type="button" className={chipCls(form.tags.includes(v))} aria-pressed={form.tags.includes(v)} onClick={() => seg.toggle("tags", v)}>
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <p className="mb-1.5 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">بدون این برچسب‌ها</p>
            {(options?.tags ?? []).length === 0 ? (
              <p className="text-[11px] text-neutral-400">برچسبی برای مشتریان این سالن ثبت نشده است.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="بدون این برچسب‌ها">
                {options?.tags.map((v) => (
                  <button key={v} type="button" className={chipCls(form.excludeTags.includes(v))} aria-pressed={form.excludeTags.includes(v)} onClick={() => seg.toggle("excludeTags", v)}>
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          <FieldRow label="دستهٔ خدمت">
            <select className={boxCls} value={form.category} onChange={(e) => patch({ category: e.target.value })}>
              <option value="">بدون محدودیت</option>
              {(options?.categories ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="آرایشگر">
            <select className={boxCls} value={form.staffId} onChange={(e) => patch({ staffId: e.target.value })}>
              <option value="">بدون محدودیت</option>
              {(options?.staff ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FieldRow>

          <FieldRow label="حداقل تعداد نوبت">
            <input className={boxCls} type="number" min={0} inputMode="numeric" value={form.minVisits} onChange={(e) => patch({ minVisits: e.target.value })} placeholder="مثلاً 2" />
          </FieldRow>
          <FieldRow label="حداکثر تعداد نوبت">
            <input className={boxCls} type="number" min={0} inputMode="numeric" value={form.maxVisits} onChange={(e) => patch({ maxVisits: e.target.value })} placeholder="بدون سقف" />
          </FieldRow>

          <FieldRow label="حداقل خرید (تومان)">
            <input className={boxCls} type="number" min={0} step={100000} inputMode="numeric" value={form.minSpend} onChange={(e) => patch({ minSpend: e.target.value })} placeholder="مثلاً 5000000" />
          </FieldRow>
          <FieldRow label="حداکثر خرید (تومان)">
            <input className={boxCls} type="number" min={0} step={100000} inputMode="numeric" value={form.maxSpend} onChange={(e) => patch({ maxSpend: e.target.value })} placeholder="بدون سقف" />
          </FieldRow>

          <FieldRow label={`روز سکوت (پیش‌فرض ${num(options?.defaults.silentDays ?? 60)})`}>
            <input className={boxCls} type="number" min={7} inputMode="numeric" value={form.silentDays} onChange={(e) => patch({ silentDays: e.target.value })} placeholder="در بخش «بدون مراجعه»" />
          </FieldRow>
          <FieldRow label={`روز اخیر (پیش‌فرض ${num(options?.defaults.recentDays ?? 14)})`}>
            <input className={boxCls} type="number" min={1} inputMode="numeric" value={form.recentDays} onChange={(e) => patch({ recentDays: e.target.value })} placeholder="در بخش «اخیراً آمده»" />
          </FieldRow>

          <button type="button" onClick={seg.reset} className="h-10 rounded-xl border border-neutral-200 text-xs font-bold text-neutral-600 transition hover:border-neutral-400 sm:col-span-2 dark:border-neutral-800 dark:text-neutral-300">
            پاک کردن بخش‌بندی
          </button>
        </div>
      ) : null}
    </div>
  );
}
