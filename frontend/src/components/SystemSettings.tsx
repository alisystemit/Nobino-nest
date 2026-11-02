"use client";

import { useMemo, useState, useEffect } from "react";
import { api } from "@/lib/api";
import { toPersianDigits } from "@/lib/utils";

/**
 * پنل تنظیمات سیستم (سوپرادمین) — کاملاً کاتالوگ‌محور.
 *
 * منبع نمایش، `sections` + `values` پاسخ `/api/admin/settings` است؛ یعنی هر کلیدی
 * که بک‌اند مصرف می‌کند (کلیدهای AI/STT، سرویس‌های پیامک، اعتبارنامهٔ ۱۹ درگاه،
 * SMTP، توکن Blob، کلید کران و…) همین‌جا دیده و قابل وارد کردن است — حتی اگر
 * هنوز هیچ رکوردی در جدول تنظیمات برایش ساخته نشده باشد. قبلاً پنل فقط ردیف‌های
 * موجود در دیتابیس را نشان می‌داد، پس کلید تازه را نمی‌شد از UI اضافه کرد.
 *
 * اولویت مقادیر: تنظیم پنل ← متغیر محیطی. به همین دلیل هر فیلد برچسب منبع
 * (ذخیره‌شده / از env / خالی) دارد و مقدارهای فقط‌خواندنی (env-only) قابل ویرایش
 * نیستند و وضعیت پر‌بودنشان نمایش داده می‌شود.
 */

type FieldType = "secret" | "string" | "number" | "boolean" | "select";

type CatalogValue = {
  key: string;
  group: string;
  label: string;
  type: FieldType;
  options?: string[];
  hint?: string;
  isSecret: boolean;
  readOnly: boolean;
  env?: string;
  hasDbValue: boolean;
  hasEnvValue: boolean;
  source: "db" | "env" | "none";
  value: string;
};

type CatalogField = { key: string; label: string; type: FieldType; env?: string; options?: string[]; placeholder?: string; hint?: string; readOnly?: boolean };
type CatalogCard = { id: string; title: string; description?: string; fields: CatalogField[] };
type CatalogSection = {
  id: string;
  title: string;
  emoji: string;
  description?: string;
  activeKey?: string;
  activeLabels?: { value: string; label: string }[];
  activeField?: CatalogField;
  cards: CatalogCard[];
};

type SettingsPayload = {
  success: boolean;
  error?: string;
  sections?: CatalogSection[];
  values?: CatalogValue[];
  extras?: { key: string; group: string; label: string; type: string; isSecret: boolean; hasDbValue: boolean; value: string }[];
};

const KEEP_SECRET = "__KEEP__";

/** برچسب فارسی گزینه‌های select/boolean */
function optionLabel(value: string, labels?: { value: string; label: string }[]): string {
  const hit = labels?.find((l) => l.value === value);
  if (hit) return hit.label;
  if (value === "true") return "روشن";
  if (value === "false") return "خاموش";
  return value;
}

function SourceBadge({ v }: { v: CatalogValue }) {
  if (v.readOnly) {
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${v.hasEnvValue ? "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"}`}>
        {v.hasEnvValue ? "از محیط (فقط‌خواندنی)" : "در .env ست نشده"}
      </span>
    );
  }
  if (v.source === "db") {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">ذخیره شده</span>;
  }
  if (v.source === "env") {
    return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">از env</span>;
  }
  return <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">خالی</span>;
}

export default function SystemSettings() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<CatalogSection[]>([]);
  const [values, setValues] = useState<CatalogValue[]>([]);
  const [extras, setExtras] = useState<SettingsPayload["extras"]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const r = await api<SettingsPayload>("/api/admin/settings");
      if (!r.ok || !r.data?.success) {
        setError(String(r.data?.error ?? "خطا در بارگذاری تنظیمات"));
        setLoading(false);
        return;
      }
      const vs = r.data.values ?? [];
      const init: Record<string, string> = {};
      for (const v of vs) init[v.key] = v.value;
      setSections(r.data.sections ?? []);
      setValues(vs);
      setExtras(r.data.extras ?? []);
      setForm(init);
      setLoading(false);
    })();
  }, []);

  const valueMap = useMemo(() => new Map(values.map((v) => [v.key, v])), [values]);

  function setv(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setCleared((c) => {
      if (!c.has(key)) return c;
      const n = new Set(c);
      n.delete(key);
      return n;
    });
  }

  function clearField(key: string) {
    setCleared((c) => new Set(c).add(key));
    setForm((f) => ({ ...f, [key]: "" }));
  }

  /** چند کلید واقعاً تغییر کرده‌اند (برای غیرفعال کردن دکمهٔ ذخیره) */
  const dirtyCount = useMemo(() => {
    let n = 0;
    for (const v of values) {
      if (v.readOnly) continue;
      const now = form[v.key] ?? "";
      if (cleared.has(v.key)) {
        if (v.hasDbValue) n += 1;
        continue;
      }
      if (v.isSecret) {
        //.secret فقط وقتی فرستاده می‌شود که کاربر چیزی تایپ کرده باشد
        if (now && now !== KEEP_SECRET) n += 1;
      } else if (now !== (v.value ?? "")) {
        n += 1;
      }
    }
    return n;
  }, [form, values, cleared]);

  async function save() {
    setSaving(true);
    setMsg(null);
    const updates: { key: string; value?: string; clear?: boolean; group?: string; type?: string; isSecret?: boolean }[] = [];
    for (const v of values) {
      if (v.readOnly) continue;
      if (cleared.has(v.key)) {
        if (v.hasDbValue) updates.push({ key: v.key, clear: true });
        continue;
      }
      const now = form[v.key] ?? "";
      if (v.isSecret) {
        if (now && now !== KEEP_SECRET) updates.push({ key: v.key, value: now });
      } else if (now !== (v.value ?? "")) {
        updates.push({ key: v.key, value: now });
      }
    }
    if (updates.length === 0) {
      setSaving(false);
      setMsg({ ok: true, text: "چیزی برای ذخیره تغییر نکرده است." });
      return;
    }
    const r = await api<{ success: boolean; error?: string; skipped?: { key: string; reason: string }[] }>(
      "/api/admin/settings",
      { method: "PATCH", body: JSON.stringify({ updates }) },
    );
    setSaving(false);
    if (!r.ok || !r.data?.success) {
      setMsg({ ok: false, text: String(r.data?.error ?? "خطا در ذخیره") });
      return;
    }
    const skipped = r.data.skipped?.length ? ` — ${toPersianDigits(r.data.skipped.length)} کلید فقط‌محیطی رد شد` : "";
    setMsg({ ok: true, text: `${toPersianDigits(updates.length)} تنظیم ذخیره شد ✅${skipped} (نیاز به تازه‌سازی صفحه برای دیدن مقدار تازه)` });
    setCleared(new Set());
  }

  if (loading) return <div className="py-10 text-center text-neutral-400">در حال بارگیری تنظیمات...</div>;
  if (error) return <div className="rounded-lg bg-red-50 px-4 py-3 text-red-600 dark:bg-red-950/40 dark:text-red-300">{error}</div>;

  const inputCls =
    "w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

  function FieldRow({ field, labels }: { field: CatalogField; labels?: { value: string; label: string }[] }) {
    const v = valueMap.get(field.key);
    if (!v) return null;
    const val = form[field.key] ?? "";
    const isHiddenSecret = v.isSecret && val === KEEP_SECRET;
    const isSet = cleared.has(field.key) ? false : v.isSecret ? Boolean(val === KEEP_SECRET || val) : Boolean(val);

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{field.label}</label>
          <div className="flex items-center gap-1.5">
            <SourceBadge v={v} />
            {v.hasDbValue && !v.readOnly && !cleared.has(field.key) && (
              <button onClick={() => clearField(field.key)} className="text-[10px] font-semibold text-neutral-400 hover:text-red-600">
                پاک کردن
              </button>
            )}
          </div>
        </div>

        {v.readOnly ? (
          <div className={`${inputCls} bg-neutral-50 font-mono text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400`}>
            {field.env ? `env: ${field.env}` : "—"} {v.hasEnvValue ? "(ست شده)" : "(خالی)"}
          </div>
        ) : v.type === "select" || v.options ? (
          <select value={cleared.has(field.key) ? "" : val} onChange={(e) => setv(field.key, e.target.value)} className={inputCls}>
            <option value="">— انتخاب نشده —</option>
            {(v.options ?? []).map((o) => (
              <option key={o} value={o}>
                {optionLabel(o, labels)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={v.type === "number" ? "number" : isHiddenSecret || cleared.has(field.key) ? "password" : "text"}
            value={isHiddenSecret ? "" : val}
            onChange={(e) => setv(field.key, e.target.value)}
            placeholder={isHiddenSecret ? "•••••••• (بدون تغییر — برای ست کردن تایپ کنید)" : field.placeholder ?? ""}
            className={inputCls}
          />
        )}

        {field.hint && <p className="text-[10px] leading-5 text-neutral-400">{field.hint}</p>}
        {!isSet && !v.readOnly && v.type !== "select" && !v.options && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">این مقدار خالی است؛ تا پر نشود این گزینه فعال نمی‌شود.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">تنظیمات سیستم</h2>
        <p className="text-xs text-neutral-500">
          هر کلیدی که سرور مصرف می‌کند از همین‌جا قابل تنظیم است. مقدار پنل بر متغیرهای محیطی اولویت دارد.
        </p>
      </div>

      {msg && (
        <p className={`rounded-lg px-4 py-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      {sections.map((section) => {
        const activeField = section.activeField;
        const requiredByCard = (card: CatalogCard) => {
          const creds = card.fields.filter((f) => !f.readOnly && f.type !== "boolean" && !f.options);
          if (creds.length === 0) return null;
          const all = creds.every((f) => {
            const v = valueMap.get(f.key);
            if (!v) return false;
            if (cleared.has(f.key)) return false;
            return v.isSecret ? v.hasDbValue || Boolean(form[f.key] && form[f.key] !== KEEP_SECRET) : Boolean(form[f.key] ?? v.value);
          });
          return all;
        };

        return (
          <section key={section.id} className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-neutral-900 dark:text-neutral-100">
                  {section.emoji} {section.title}
                </h3>
                {section.description && <p className="mt-1 text-xs leading-6 text-neutral-500 dark:text-neutral-400">{section.description}</p>}
              </div>
            </div>

            {activeField && (
              <div className="mt-4 max-w-sm">
                <FieldRow field={activeField} labels={section.activeLabels} />
              </div>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {section.cards.map((card) => {
                const status = requiredByCard(card);
                return (
                  <div
                    key={card.id}
                    className={`rounded-2xl border p-4 ${
                      section.activeKey && valueMap.get(section.activeKey)?.value === card.id
                        ? "border-pink-400 bg-pink-50/40 dark:border-pink-500/60 dark:bg-pink-950/20"
                        : "border-neutral-200 dark:border-neutral-800"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-neutral-800 dark:text-neutral-100">{card.title}</div>
                      {status !== null && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            status ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                          }`}
                        >
                          {status ? "کامل" : "ناقص"}
                        </span>
                      )}
                    </div>
                    {card.description && <p className="mt-1 text-[11px] leading-5 text-neutral-500">{card.description}</p>}
                    <div className="mt-3 space-y-3">
                      {card.fields.map((f) => (
                        <FieldRow key={f.key} field={f} />
                      ))}
                    </div>
                    {section.activeKey && valueMap.get(section.activeKey)?.value !== card.id && section.id === "sms" && (
                      <button onClick={() => setv(section.activeKey!, card.id)} className="mt-3 text-[11px] font-semibold text-pink-600 hover:underline">
                        انتخاب به‌عنوان سرویس فعال
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {(extras?.length ?? 0) > 0 && (
        <section className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">کلیدهای ذخیره‌شدهٔ دیگر</h3>
          <p className="mt-1 text-[11px] text-neutral-500">این رکوردها در دیتابیس هستند ولی در کاتالوگ اعلام نشده‌اند؛ برای سازگاری نمایش داده می‌شوند.</p>
          <div className="mt-3 space-y-2">
            {extras!.map((e) => (
              <div key={e.key} className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-[11px] dark:border-neutral-800">
                <code className="font-mono text-neutral-600 dark:text-neutral-300">{e.key}</code>
                <span className="text-neutral-400">{e.isSecret ? (e.hasDbValue ? "محرمانه — ست شده" : "محرمانه — خالی") : String(e.value ?? "").slice(0, 60)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <button
        onClick={save}
        disabled={saving || dirtyCount === 0}
        className="w-full rounded-xl bg-pink-600 py-3.5 font-bold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "در حال ذخیره..." : dirtyCount === 0 ? "ذخیره تنظیمات" : `ذخیره ${dirtyCount} تغییر`}
      </button>
    </div>
  );
}
