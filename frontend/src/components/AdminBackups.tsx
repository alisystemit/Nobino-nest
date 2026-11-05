"use client";

/**
 * تب «پشتیبان‌گیری» پنل سوپرادمین — فهرست، ساخت، دانلود، حذف و بازگردانی
 * بکاپ دیتابیس. داده‌ها از `/api/admin/backups*` می‌آیند؛ این فایل هیچ
 * رازی نمی‌سازد و فقط آنچه سرور (ماسک‌شده) می‌دهد را نشان می‌دهد.
 *
 * نکات UI که عمداً این‌طور انتخاب شده‌اند:
 *  - عملیات در پس‌زمینهٔ سرور اجرا می‌شود؛ تا وقتی `busy` هست هر ۱٫۵ ثانیه
 *    وضعیت تازه می‌شود و دکمه‌ها غیرفعال می‌مانند (دو عملیات هم‌زمان روی
 *    دیتابیس مجاز نیست).
 *  - بازگردانی پنجرهٔ تأیید می‌خواهد و باید کلمهٔ ROLLBACK دقیقاً نوشته
 *    شود؛ اگر ادمین رمز عبور داشته باشد، رمز هم لازم است (تأیید دوم).
 *  - متن‌های فنی (نام فایل، بایت، کامیت) LTR و با رقم لاتین نمایش داده
 *    می‌شوند؛ برچسب‌های فارسی با رقم فارسی.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Ctx = {
  setMsg: (m: { ok: boolean; text: string } | null) => void;
};

type Backup = {
  name: string;
  engine: "pg" | "json";
  kind: "manual" | "pre-restore" | "deploy";
  bytes: number;
  createdAt: string;
  commit: string;
  branch: string;
  db: string;
  label: string;
  tables: number;
  rows: number;
  actor: string;
};

type Job = {
  id: string;
  kind: "create" | "restore";
  status: "running" | "done" | "failed";
  engine: "pg" | "json";
  startedAt: string;
  finishedAt?: string;
  message: string;
  target: string;
};

type Status = {
  success: boolean;
  error?: string;
  dir: string;
  dirExists: boolean;
  engine: "pg" | "json";
  enginePreference: "auto" | "pg" | "json";
  pgAvailable: boolean;
  keep: number;
  db: string;
  host: string;
  port: string;
  commit: string;
  branch: string;
  busy: Job | null;
  jobs: Job[];
  backups: Backup[];
};

/* کلاس‌های هم‌شکل با بقیهٔ پنل (AdminExtras) */
const card = "rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
const row = "rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
const input =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const ghostBtn =
  "rounded-lg bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700";
const dangerBtn =
  "rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/40";
const okBtn =
  "rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40";
const primaryBtn =
  "rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-pink-500/20 transition hover:opacity-95 disabled:opacity-50";

const faInt = (n?: number | null) => (typeof n === "number" ? n.toLocaleString("fa-IR") : "—");
const faDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString("fa-IR") : "—");

const KIND_META: Record<Backup["kind"], { label: string; cls: string }> = {
  manual: { label: "دستی", cls: "bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  "pre-restore": { label: "پیش از بازگردانی", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  deploy: { label: "اسکریپت دپلوی", cls: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
};

const ENGINE_META: Record<Backup["engine"], { label: string; hint: string }> = {
  pg: { label: "pg_dump", hint: "قالب custom — همان فایلی که deploy/update.sh می‌سازد" },
  json: { label: "JSON", hint: "بازگردانی در یک تراکنش؛ بدون نیاز به ابزار سرور" },
};

function faBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "۰";
  const units = ["بایت", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const num = i === 0 ? Math.round(v) : Number(v.toFixed(v >= 100 ? 0 : 1));
  return `${num.toLocaleString("fa-IR")} ${units[i]}`;
}

/** `dir` مسیر مطلق سرور است؛ برای نمایش فقط نام پوشه کافی است */
function dirLabel(dir: string): string {
  const parts = String(dir ?? "").split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "backups";
}

export default function AdminBackups({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [restore, setRestore] = useState<Backup | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/backups");
      const d = (await res.json()) as Status;
      if (!d.success) {
        if (!silent) ctx.setMsg({ ok: false, text: String(d.error ?? "خطا در خواندن بکاپ‌ها") });
        return null;
      }
      setData(d);
      return d;
    } catch {
      if (!silent) ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void load();
  }, [load]);

  // تا وقتی کاری در جریان است، فهرست/پیشرفت تازه می‌شود
  const running = Boolean(data?.busy);
  useEffect(() => {
    if (!running) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => void load(true), 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [running, load]);

  async function makeBackup() {
    setBusyAction("create");
    try {
      const res = await fetch("/api/admin/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const d = await res.json();
      if (!d.success) {
        ctx.setMsg({ ok: false, text: String(d.error ?? "بکاپ‌گیری شروع نشد") });
        return;
      }
      ctx.setMsg({ ok: true, text: "بکاپ‌گیری آغاز شد؛ در همان صفحه نتیجه را می‌بینید." });
      setLabel("");
      await load(true);
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveConfig(patch: Record<string, unknown>, okText: string) {
    setBusyAction("config");
    try {
      const res = await fetch("/api/admin/backups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (!d.success) return ctx.setMsg({ ok: false, text: String(d.error ?? "ذخیره نشد") });
      setData(d as Status);
      ctx.setMsg({ ok: true, text: okText });
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setBusyAction(null);
    }
  }

  async function remove(b: Backup) {
    if (!window.confirm(`فایل «${b.name}» از دیسک حذف شود؟ این کار برگشت‌ناپذیر است.`)) return;
    setBusyAction(`del:${b.name}`);
    try {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(b.name)}`, { method: "DELETE" });
      const d = await res.json();
      if (!d.success) return ctx.setMsg({ ok: false, text: String(d.error ?? "حذف نشد") });
      ctx.setMsg({ ok: true, text: "بکاپ حذف شد ✅" });
      await load(true);
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setBusyAction(null);
    }
  }

  if (loading && !data) return <div className="py-8 text-center text-sm text-neutral-500">در حال بارگذاری…</div>;
  if (!data) return <div className={card}>خوانده نشد. <button className={ghostBtn} onClick={() => load()}>تلاش دوباره</button></div>;

  const backups = data.backups ?? [];
  const failed = (data.jobs ?? []).filter((j) => j.status === "failed").slice(0, 3);

  return (
    <div className="space-y-5">
      {/* وضعیت سرور */}
      <div className={`${card} flex flex-wrap items-start justify-between gap-4`}>
        <div className="min-w-0">
          <h3 className="font-extrabold text-neutral-900 dark:text-neutral-100">پشتیبان‌گیری دیتابیس</h3>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            دیتابیس «<span dir="ltr" className="font-mono">{data.db || "—"}</span>» روی «
            <span dir="ltr" className="font-mono">{data.host}{data.port ? `:${data.port}` : ""}</span>» — فایل‌ها در پوشهٔ{' '}
            <span dir="ltr" className="font-mono">{dirLabel(data.dir)}</span> نگه می‌شوند و هرگز در گیت یا از بیرون سرو نمی‌شوند.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-neutral-100 px-3 py-1 font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              موتور فعال: {ENGINE_META[data.engine]?.label ?? data.engine}
            </span>
            <span className={`rounded-full px-3 py-1 font-bold ${data.pgAvailable ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"}`}>
              {data.pgAvailable ? "pg_dump روی سرور هست" : "pg_dump نیست — موتور JSON"}
            </span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              کامیت <span dir="ltr" className="font-mono">{data.commit}</span>
            </span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {faInt(backups.length)} بکاپ
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-3">
          <button onClick={makeBackup} disabled={running || busyAction === "create"} className={primaryBtn}>
            {running ? "در حال انجام…" : busyAction === "create" ? "شروع شد…" : "بکاپ تازه بگیر"}
          </button>
          <input
            className={`${input} w-56`}
            placeholder="برچسب (اختیاری)"
            value={label}
            maxLength={90}
            onChange={(e) => setLabel(e.target.value)}
            disabled={running}
          />
        </div>
      </div>

      {/* کار در جریان */}
      {data.busy && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-200">
          <span className="font-black">
            {data.busy.kind === "create" ? "بکاپ‌گیری" : "بازگردانی"} در جریان است…
          </span>
          <div className="mt-1 text-xs leading-relaxed">{data.busy.message}</div>
        </div>
      )}

      {failed.length > 0 && !running && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <div className="font-black">آخرین خطاها:</div>
          {failed.map((j) => (
            <div key={j.id} className="mt-1">
              • {j.kind === "create" ? "بکاپ" : "بازگردانی"} {j.target ? `«${j.target}»` : ""} — {j.message}
            </div>
          ))}
        </div>
      )}

      {/* فهرست */}
      <div className="space-y-3">
        {!backups.length && (
          <div className={`${card} text-center text-sm text-neutral-500`}>
            هنوز بکاپی در این پوشه نیست. با دکمهٔ «بکاپ تازه بگیر» اولین نسخه را بسازید.
          </div>
        )}
        {backups.map((b) => (
          <div key={b.name} className={`${row} flex flex-wrap items-center justify-between gap-3`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span dir="ltr" className="truncate font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200">{b.name}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${KIND_META[b.kind]?.cls ?? ""}`}>{KIND_META[b.kind]?.label ?? b.kind}</span>
                <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400" title={ENGINE_META[b.engine]?.hint}>
                  {ENGINE_META[b.engine]?.label ?? b.engine}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                <span>{faDateTime(b.createdAt)}</span>
                <span>{faBytes(b.bytes)}</span>
                {b.rows > 0 && <span>{faInt(b.rows)} ردیف در {faInt(b.tables)} جدول</span>}
                <span dir="ltr" className="font-mono">{b.commit}</span>
                {b.label && <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{b.label}</span>}
                {b.actor && <span>توسط {b.actor}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`/api/admin/backups/${encodeURIComponent(b.name)}/download`}
                className={ghostBtn}
                title="دانلود فایل بکاپ"
              >
                دانلود
              </a>
              <button onClick={() => setRestore(b)} disabled={running} className={dangerBtn}>
                بازگردانی…
              </button>
              <button onClick={() => remove(b)} disabled={running || busyAction === `del:${b.name}`} className={okBtn}>
                {busyAction === `del:${b.name}` ? "…" : "حذف"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* تنظیمات */}
      <div className={`${card} flex flex-wrap items-center gap-4`}>
        <label className="flex items-center gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-300">
          تعداد نگه‌داشتن
          <KeepBox value={data.keep} disabled={running} onSave={(n) => saveConfig({ keep: n }, `از این پس ${n.toLocaleString("fa-IR")} بکاپ تازه نگه داشته می‌شود.`)} />
        </label>
        <label className="flex items-center gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-300">
          موتور
          <select
            className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs font-bold dark:border-neutral-700 dark:bg-neutral-800"
            value={data.enginePreference}
            disabled={running}
            onChange={(e) => void saveConfig({ engine: e.target.value }, "موتور بکاپ تغییر کرد.")}
          >
            <option value="auto">خودکار</option>
            <option value="pg">pg_dump (اگر باشد)</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          بکاپ‌های کهنه‌تر از حدِ نگه‌داشتن پس از هر بکاپ تازه پاک می‌شوند. پیش از بازگردانی همیشه یک بکاپ ایمنی «پیش از بازگردانی» ساخته می‌شود.
        </p>
      </div>

      {restore && (
        <RestoreDialog
          backup={restore}
          onClose={() => setRestore(null)}
          onDone={() => {
            setRestore(null);
            void load(true);
          }}
          ctx={ctx}
        />
      )}
    </div>
  );
}

/** کادر عددِ «تعداد نگه‌داشتن» — با Enter یا خروج از فیلد ذخیره می‌شود */
function KeepBox({ value, disabled, onSave }: { value: number; disabled: boolean; onSave: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const n = Number(text);
  const valid = Number.isInteger(n) && n >= 1 && n <= 200;
  return (
    <span className="inline-flex items-center gap-1">
      <input
        dir="ltr"
        className={`w-16 rounded-lg border px-2 py-1 text-center text-xs font-bold ${valid ? "border-neutral-300 dark:border-neutral-700" : "border-red-400"} bg-white dark:bg-neutral-800`}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (valid && n !== value) onSave(n);
          else setText(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {valid && n !== value && (
        <button className={ghostBtn} disabled={disabled} onClick={() => onSave(n)}>
          ذخیره
        </button>
      )}
    </span>
  );
}

/**
 * پنجرهٔ بازگردانی: نام بکاپ را تکرار می‌خواهد نه — کلمهٔ ROLLBACK (همان
 * قرارداد deploy/update.sh) و در صورت داشتن رمز عبور، رمز ورود هم.
 */
function RestoreDialog({ backup, onClose, onDone, ctx }: { backup: Backup; onClose: () => void; onDone: () => void; ctx: Ctx }) {
  const [word, setWord] = useState("");
  const [password, setPassword] = useState("");
  const [snapshotFirst, setSnapshotFirst] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsPassword, setNeedsPassword] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/password/status")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setNeedsPassword(Boolean(d?.hasPassword));
      })
      .catch(() => {
        if (!cancelled) setNeedsPassword(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = word.trim() === "ROLLBACK" && (!needsPassword || password.length > 0) && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(backup.name)}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: word.trim(), password: password || undefined, snapshotFirst }),
      });
      const d = await res.json();
      if (!d.success) {
        ctx.setMsg({ ok: false, text: String(d.error ?? "بازگردانی انجام نشد") });
        return;
      }
      ctx.setMsg({ ok: true, text: "بازگردانی آغاز شد — تا پایان همین صفحه را نبندید." });
      onDone();
    } catch {
      ctx.setMsg({ ok: false, text: "خطا در ارتباط با سرور" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-black text-red-600 dark:text-red-400">بازگردانی دیتابیس</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          همهٔ دادهٔ فعلی دیتابیس «<span dir="ltr" className="font-mono">{backup.db}</span>» با محتوای بکاپ{' '}
          <span dir="ltr" className="font-mono text-xs">{backup.name}</span> ({faBytes(backup.bytes)}، {faDateTime(backup.createdAt)}) جایگزین می‌شود.
        </p>

        <ul className="mt-3 space-y-2 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <li>• اگر بکاپ از نسخهٔ قدیمی‌ترِ کد باشد، ممکن است schema فعلی با دادهٔ بازگردانی‌شده نخواند.</li>
          <li>• در مدت بازگردانی نوبت‌گیری و پرداخت را متوقف کنید.</li>
          <li>• «بکاپ ایمنی خودکار» را روشن بگذارید تا اگر این بازگردانی اشتباه بود، همان لحظهٔ قبل برگردد.</li>
        </ul>

        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
            <input type="checkbox" checked={snapshotFirst} onChange={(e) => setSnapshotFirst(e.target.checked)} className="mt-0.5 h-4 w-4 accent-pink-600" disabled={busy} />
            پیش از بازگردانی، بکاپ ایمنی از وضعیت فعلی بگیر
          </label>

          <input
            dir="ltr"
            className={input}
            placeholder="برای تأیید بنویسید: ROLLBACK"
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />

          {needsPassword && (
            <input
              className={input}
              type="password"
              placeholder="رمز عبور ورود خودتان (تأیید دوم)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button className={ghostBtn} onClick={onClose} disabled={busy}>
            انصراف
          </button>
          <button className={`${dangerBtn} px-4 py-2 text-sm`} onClick={submit} disabled={!ready}>
            {busy ? "…" : "بازگردانی کن"}
          </button>
        </div>
      </div>
    </div>
  );
}
