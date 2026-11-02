"use client";

import { useEffect, useMemo, useState } from "react";
import { toPersianDigits } from "@/lib/utils";

/**
 * تب «هوش مصنوعی» سوپرادمین — کلیدها، فعال‌سازی و تست اتصال.
 *
 * وضعیت از GET /api/admin/ai/status می‌آید (سرویس AiLlmService در بک‌اند) و
 * ذخیره با همان PATCH /api/admin/settings عمومی انجام می‌شود؛ یعنی همین کلیدها
 * در تب «تنظیمات سیستم» هم دیده می‌شوند و مسیرهای سایت (دستیار سالن، تحلیل،
 * تولید محتوا) دقیقاً از همین سرویس فعال استفاده می‌کنند.
 */

type ProviderInfo = {
  id: string;
  name: string;
  description: string;
  modelHint: string;
  defaultModel: string;
  keySet: boolean;
  keyMasked: string | null;
};

type AiStatus = {
  success: boolean;
  switchOn: boolean;
  provider: string | null;
  preferredProvider: string;
  active: { provider: string; model: string; baseUrl: string } | null;
  llmProviders: ProviderInfo[];
};

type SettingValue = { key: string; value: string };

const inputCls =
  "w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-pink-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

const KEY_MAP: Record<string, string> = {
  openai: "openai.api_key",
  groq: "stt.groq.key",
  deepseek: "ai.deepseek.key",
  custom: "ai.custom.key",
};

const MODEL_MAP: Record<string, string> = {
  openai: "ai.openai.model",
  groq: "ai.groq.model",
  deepseek: "ai.deepseek.model",
  custom: "ai.custom.model",
};

export default function AiSettings() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [orig, setOrig] = useState<Record<string, string>>({});
  const [form, setForm] = useState<Record<string, string>>({});
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function refresh() {
    const [st, set] = await Promise.all([
      fetch("/api/admin/ai/status").then((r) => r.json()).catch(() => null),
      fetch("/api/admin/settings").then((r) => r.json()).catch(() => null),
    ]);
    if (st?.success) setStatus(st as AiStatus);
    if (set?.success) {
      const init: Record<string, string> = {};
      for (const v of (set.values ?? []) as SettingValue[]) init[v.key] = v.value;
      setOrig(init);
      setForm(init);
    }
  }

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  function setv(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setCleared((c) => {
      if (!c.has(key)) return c;
      const n = new Set(c);
      n.delete(key);
      return n;
    });
  }

  function clearKey(key: string) {
    setCleared((c) => new Set(c).add(key));
    setForm((f) => ({ ...f, [key]: "" }));
  }

  const dirty = useMemo(() => {
    const watched = [
      "ai.enabled",
      "ai.provider",
      "ai.model",
      ...Object.values(KEY_MAP),
      ...Object.values(MODEL_MAP),
      "ai.custom.base_url",
    ];
    let n = 0;
    for (const key of watched) {
      if (cleared.has(key)) {
        if ((orig[key] ?? "") !== "") n += 1;
        continue;
      }
      const now = (form[key] ?? "").trim();
      const isSecret = Object.values(KEY_MAP).includes(key);
      if (isSecret) {
        if (now) n += 1;
      } else if (now !== (orig[key] ?? "")) {
        n += 1;
      }
    }
    return n;
  }, [form, orig, cleared]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const updates: { key: string; value?: string; clear?: boolean; group?: string; type?: string; isSecret?: boolean }[] = [];
    const add = (key: string, opts: { secret?: boolean; type?: string } = {}) => {
      if (cleared.has(key)) {
        if ((orig[key] ?? "") !== "") updates.push({ key, clear: true, group: "ai" });
        return;
      }
      const v = (form[key] ?? "").trim();
      if (opts.secret) {
        if (v) updates.push({ key, value: v, group: "ai", type: "secret", isSecret: true });
        return;
      }
      if (v !== (orig[key] ?? "")) updates.push({ key, value: v, group: "ai", ...(opts.type ? { type: opts.type } : {}) });
    };

    add("ai.enabled", { type: "select" });
    add("ai.provider", { type: "select" });
    add("ai.model");
    add("openai.api_key", { secret: true });
    add("stt.groq.key", { secret: true });
    add("ai.deepseek.key", { secret: true });
    add("ai.custom.key", { secret: true });
    add("ai.openai.model");
    add("ai.groq.model");
    add("ai.deepseek.model");
    add("ai.custom.model");
    add("ai.custom.base_url");

    if (updates.length === 0) {
      setBusy(false);
      setMsg({ ok: true, text: "چیزی برای ذخیره تغییر نکرده است." });
      return;
    }

    try {
      const r = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const d = await r.json();
      if (!d.success) {
        setMsg({ ok: false, text: d.error ?? "خطا در ذخیره" });
      } else {
        setMsg({ ok: true, text: `${toPersianDigits(updates.length)} تنظیم هوش مصنوعی ذخیره شد ✅` });
        setCleared(new Set());
        await refresh();
      }
    } catch {
      setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch("/api/admin/ai/test", { method: "POST" });
      const d = await r.json();
      if (d.success) {
        setTestResult({
          ok: true,
          message: `اتصال با «${d.provider}» و مدل ${d.model} برقرار شد ✅ (${d.latencyMs}ms)${d.sample ? ` — پاسخ نمونه: «${d.sample}»` : ""}`,
        });
      } else {
        setTestResult({ ok: false, message: d.error ?? "اتصال برقرار نشد" });
      }
    } catch {
      setTestResult({ ok: false, message: "خطا در ارتباط با سرور" });
    } finally {
      setTesting(false);
      refresh();
    }
  }

  if (loading) return <div className="py-10 text-center text-neutral-400">در حال بارگیری وضعیت هوش مصنوعی...</div>;

  const providers = status?.llmProviders ?? [];
  const preferred = (form["ai.provider"] ?? "").trim() || null;
  const chosenId = preferred || status?.provider || null;
  const enabled = (form["ai.enabled"] ?? "true").trim().toLowerCase() !== "false";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-extrabold text-neutral-900 dark:text-neutral-100">🤖 هوش مصنوعی</h2>
        <p className="text-xs text-neutral-500">
          کلید سرویس متن را وارد کنید، فعال کنید و اتصال را تست کنید. همان سرویس در دستیار سایت، تحلیل کسب‌وکار و تولید محتوا استفاده می‌شود.
        </p>
      </div>

      {msg && (
        <p className={`rounded-lg px-4 py-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300"}`}>
          {msg.text}
        </p>
      )}

      {/* وضعیت و فعال‌سازی */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                enabled && status?.active
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : enabled
                    ? "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
              }`}
            >
              {!enabled ? "⛔ غیرفعال است" : status?.active ? `✅ فعال — ${status.active.provider} / ${status.active.model}` : "⚠️ فعال ولی بدون کلید"}
            </span>
            {status?.active?.baseUrl && <code className="text-[11px] text-neutral-400" dir="ltr">{status.active.baseUrl}</code>}
          </div>
          <div className="flex items-center gap-2">
            <select
              className={`${inputCls} w-auto`}
              value={enabled ? "true" : "false"}
              onChange={(e) => setv("ai.enabled", e.target.value)}
              aria-label="فعال‌سازی هوش مصنوعی"
            >
              <option value="true">روشن</option>
              <option value="false">خاموش</option>
            </select>
            <button
              onClick={test}
              disabled={testing}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-700 disabled:opacity-50"
            >
              {testing ? "در حال تست..." : "⚡ تست اتصال"}
            </button>
          </div>
        </div>

        {testResult && (
          <div className={`mt-3 rounded-xl px-4 py-3 text-sm leading-6 ${testResult.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"}`}>
            {testResult.message}
          </div>
        )}

        <div className="mt-3 grid gap-2 text-[11px] leading-6 text-neutral-500 dark:text-neutral-400">
          <div>💡 اگر «سرویس متن» را انتخاب نکنید، اولین سرویسی که کلیدش پر باشد خودکار استفاده می‌شود.</div>
          <div>💡 کلید OpenAI و Groq با مسیر تبدیل گفتار به متن (STT) مشترک‌اند؛ یک بار وارد کردن کافی است.</div>
        </div>
      </div>

      {/* کارت سرویس‌ها */}
      <div className="grid gap-4 sm:grid-cols-2">
        {providers.map((p) => {
          const keyField = KEY_MAP[p.id];
          const modelField = MODEL_MAP[p.id];
          const isChosen = chosenId === p.id;
          const keyVal = cleared.has(keyField) ? "" : (form[keyField] ?? "").trim();
          const shownKey = keyVal || (p.keySet ? p.keyMasked ?? "" : "");
          return (
            <div
              key={p.id}
              onClick={() => setv("ai.provider", p.id)}
              className={`cursor-pointer rounded-2xl border p-4 transition ${
                isChosen
                  ? "border-pink-400 bg-pink-50/40 dark:border-pink-500/60 dark:bg-pink-950/20"
                  : "border-neutral-200 bg-white hover:border-pink-200 dark:border-neutral-800 dark:bg-neutral-900"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 font-bold text-neutral-800 dark:text-neutral-100">
                  <input
                    type="radio"
                    name="llm-provider"
                    checked={isChosen}
                    onChange={() => setv("ai.provider", p.id)}
                    className="h-4 w-4 accent-pink-600"
                  />
                  {p.name}
                </label>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    p.keySet ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  {p.keySet ? `کلید ست شده (${p.keyMasked})` : "بدون کلید"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-5 text-neutral-500 dark:text-neutral-400">{p.description}</p>

              <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">کلید API</label>
                    {(p.keySet || keyVal) && !cleared.has(keyField) && (
                      <button onClick={() => clearKey(keyField)} className="text-[10px] font-semibold text-neutral-400 hover:text-red-600">
                        پاک کردن
                      </button>
                    )}
                  </div>
                  <input
                    className={inputCls}
                    dir="ltr"
                    type="password"
                    value={keyVal}
                    onChange={(e) => setv(keyField, e.target.value)}
                    placeholder={shownKey ? "برای تغییر تایپ کنید (کلید فعلی حفظ می‌شود)" : "کلید را وارد کنید"}
                  />
                </div>
                {p.id === "custom" && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">آدرس پایه (base URL)</label>
                    <input
                      className={inputCls}
                      dir="ltr"
                      value={form["ai.custom.base_url"] ?? ""}
                      onChange={(e) => setv("ai.custom.base_url", e.target.value)}
                      placeholder="http://localhost:11434/v1"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">مدل</label>
                  <input
                    className={inputCls}
                    dir="ltr"
                    value={form[modelField] ?? ""}
                    onChange={(e) => setv(modelField, e.target.value)}
                    placeholder={p.defaultModel || p.modelHint}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={busy || dirty === 0}
          className="rounded-xl bg-pink-600 px-6 py-3 font-bold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "در حال ذخیره..." : dirty === 0 ? "ذخیره تنظیمات" : `ذخیره ${dirty.toLocaleString("fa-IR")} تغییر`}
        </button>
        <p className="text-[11px] text-neutral-400">با ذخیره، دستیار هوشمند سایت، تحلیل سالن و تولید محتوا از همین سرویس استفاده می‌کنند.</p>
      </div>
    </div>
  );
}
