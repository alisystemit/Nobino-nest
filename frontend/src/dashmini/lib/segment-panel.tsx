/**
 * پنل بخش‌بندی مخاطب کمپین — نسخهٔ مینی‌استایل.
 *
 * منطق (fetch گزینه‌ها، شمارش زنده، تبدیل فرم به payload) در
 * `@/lib/campaign-segments` است و بین دو داشبورد مشترک است؛ این فایل فقط
 * کنترل‌ها را با کلاس‌های `mini-*` می‌چیند.
 */
import { Field, Icon } from "@/mini/components/ui";
import { faDigits } from "@/mini/lib/format";
import { previewNote, SEGMENT_HINT, SEGMENT_KEYS, SEGMENT_LABEL, type SegmentBuilder, type SegmentKey } from "@/lib/campaign-segments";

/** چیپ انتخاب‌شدنی — همان ظاهر `mini-chip` ولی با وضعیت فشار برای صفحه‌خوان */
function ToggleChip({ on, children, onClick, label }: { on: boolean; children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button type="button" className={`mini-chip${on ? " is-on" : ""}`} aria-pressed={on} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function TagChips({
  label,
  values,
  selected,
  onToggle,
  none,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
  none: string;
}) {
  return (
    <div>
      <p className="seg-sub">{label}</p>
      {values.length === 0 ? (
        <p className="seg-sub">{none}</p>
      ) : (
        <div className="mini-chips seg-chips" role="group" aria-label={label}>
          {values.map((v) => (
            <ToggleChip key={v} on={selected.includes(v)} label={`${label}: ${v}`} onClick={() => onToggle(v)}>
              {v}
            </ToggleChip>
          ))}
        </div>
      )}
    </div>
  );
}

export function SegmentPanel({ seg }: { seg: SegmentBuilder }) {
  const { options, form, patch, preview, previewing, error, counts } = seg;
  const note = previewNote(preview, previewing, faDigits);

  return (
    <div className="seg-panel">
      <div className="mini-chips seg-chips" role="group" aria-label="بخش هدف کمپین">
        {SEGMENT_KEYS.map((key) => (
          <ToggleChip
            key={key}
            on={seg.segment === key}
            label={`بخش ${SEGMENT_LABEL[key]}، ${faDigits(counts[key] ?? 0)} مشتری`}
            onClick={() => seg.setSegment(key)}
          >
            {counts[key] === undefined ? SEGMENT_LABEL[key] : `${SEGMENT_LABEL[key]} · ${faDigits(counts[key])}`}
          </ToggleChip>
        ))}
      </div>

      <p className="seg-sub">{SEGMENT_HINT[seg.segment]}</p>

      <button type="button" className="mini-btn soft seg-toggle" aria-expanded={seg.open} onClick={() => seg.setOpen((v) => !v)}>
        <Icon name="users" size={16} />
        معیارهای دقیق{seg.active > 0 ? ` (${faDigits(seg.active)})` : ""}
      </button>

      {/* شمارندهٔ زنده از سرور می‌آید؛ تغییرش باید برای صفحه‌خوان اعلام شود */}
      <div className="mini-note seg-count-box" aria-live="polite">
        <span>{error || note || "در حال شمارش مخاطب…"}</span>
        {preview && preview.sample.length > 0 ? <span className="seg-sample">نمونه: {preview.sample.map((s) => s.name || s.phone).join("، ")}</span> : null}
      </div>

      {seg.open ? (
        <div className="dash-form-gap seg-fields">
          <TagChips
            label="فقط با این برچسب‌ها"
            values={options?.tags ?? []}
            selected={form.tags}
            onToggle={(v) => seg.toggle("tags", v)}
            none="برچسبی برای مشتریان این سالن ثبت نشده است."
          />
          <TagChips
            label="بدون این برچسب‌ها"
            values={options?.tags ?? []}
            selected={form.excludeTags}
            onToggle={(v) => seg.toggle("excludeTags", v)}
            none="برچسبی برای مشتریان این سالن ثبت نشده است."
          />

          <div className="dash-two">
            <div className="mini-field">
              <label htmlFor="segCategory">دستهٔ خدمت</label>
              <select id="segCategory" className="mini-input" value={form.category} onChange={(e) => patch({ category: e.target.value })}>
                <option value="">بدون محدودیت</option>
                {(options?.categories ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="mini-field">
              <label htmlFor="segStaff">آرایشگر</label>
              <select id="segStaff" className="mini-input" value={form.staffId} onChange={(e) => patch({ staffId: e.target.value })}>
                <option value="">بدون محدودیت</option>
                {(options?.staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="dash-two">
            <Field label="حداقل تعداد نوبت" name="segMinVisits" type="number" min={0} inputMode="numeric" value={form.minVisits} onChange={(e) => patch({ minVisits: e.target.value })} placeholder="مثلاً 2" />
            <Field label="حداکثر تعداد نوبت" name="segMaxVisits" type="number" min={0} inputMode="numeric" value={form.maxVisits} onChange={(e) => patch({ maxVisits: e.target.value })} placeholder="بدون سقف" />
          </div>

          <div className="dash-two">
            <Field label="حداقل خرید (تومان)" name="segMinSpend" type="number" min={0} step={100000} inputMode="numeric" value={form.minSpend} onChange={(e) => patch({ minSpend: e.target.value })} placeholder="مثلاً 5000000" />
            <Field label="حداکثر خرید (تومان)" name="segMaxSpend" type="number" min={0} step={100000} inputMode="numeric" value={form.maxSpend} onChange={(e) => patch({ maxSpend: e.target.value })} placeholder="بدون سقف" />
          </div>

          <div className="dash-two">
            <Field
              label={`روز سکوت (پیش‌فرض ${faDigits(options?.defaults.silentDays ?? 60)})`}
              name="segSilentDays"
              type="number"
              min={7}
              inputMode="numeric"
              value={form.silentDays}
              onChange={(e) => patch({ silentDays: e.target.value })}
              hint="در بخش «بدون مراجعه» اثر دارد."
            />
            <Field
              label={`روز اخیر (پیش‌فرض ${faDigits(options?.defaults.recentDays ?? 14)})`}
              name="segRecentDays"
              type="number"
              min={1}
              inputMode="numeric"
              value={form.recentDays}
              onChange={(e) => patch({ recentDays: e.target.value })}
              hint="در بخش «اخیراً آمده» اثر دارد."
            />
          </div>

          <button type="button" className="mini-btn ghost seg-reset" onClick={seg.reset}>
            <Icon name="refresh" size={16} />
            پاک کردن بخش‌بندی
          </button>
        </div>
      ) : null}
    </div>
  );
}
