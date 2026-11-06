"use client";

import { useEffect, useRef, useState } from "react";
import { toPersianDigits } from "@/lib/utils";

type Pm2Item = { name: string; id: number | null; status: string; restarts: number; uptimeMs: number | null };

type OpsStatus = {
  success?: boolean;
  code?: string;
  error?: string;
  enabled?: boolean;
  server?: { node: string; platform: string; arch: string; pid: number; uptimeSec: number; memoryMb: number; cwd: string; hostname: string; env: string };
  db?: { ok: boolean; ms: number; error?: string };
  git?: { branch?: string; commit?: string; error?: string };
  pm2?: { available: boolean; list?: Pm2Item[] };
  disk?: { filesystem?: string; sizeKb?: number; usedKb?: number; availKb?: number; usePercent?: string; mount?: string; error?: string };
  deploy?: { running: boolean; startedAt: number | null; pid: number | null; cmd: string | null; tail: string[] };
};

type OpsLogs = { success?: boolean; error?: string; found?: boolean; path?: string; hint?: string; lines?: string[] };

const card = "rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";
const btn =
  "rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50";

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${toPersianDigits(d)} روز و ${toPersianDigits(h)} ساعت`;
  if (h > 0) return `${toPersianDigits(h)} ساعت و ${toPersianDigits(m)} دقیقه`;
  return `${toPersianDigits(m)} دقیقه`;
}

function fmtKb(kb: number): string {
  if (kb >= 1048576) return `${toPersianDigits(Math.round(kb / 1048576))} گیگ`;
  return `${toPersianDigits(Math.round(kb / 1024))} مگ`;
}

const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />;
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 last:border-0 dark:border-neutral-800">
      <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className="flex items-center gap-2 text-sm font-bold text-neutral-900 dark:text-neutral-100" dir="ltr">
        {ok !== undefined && <StatusDot ok={ok} />}
        {value}
      </span>
    </div>
  );
}

export default function AdminOps() {
  const [status, setStatus] = useState<OpsStatus | null>(null);
  const [logs, setLogs] = useState<OpsLogs | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployBusy, setDeployBusy] = useState(false);
  const [deployNote, setDeployNote] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  const loadStatus = async () => {
    try {
      const r = await fetch("/api/admin/ops");
      const d = (await r.json()) as OpsStatus;
      setStatus(d);
      return d;
    } catch {
      setStatus({ success: false, error: "خطا در ارتباط با سرور" });
      return null;
    }
  };

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const enableConsole = async () => {
    setEnabling(true);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ key: "ops.console.enabled", value: "true" }] }),
      });
      const d = await r.json();
      if (!d.success) {
        setStatus({ success: false, error: d.error ?? "فعال‌سازی انجام نشد" });
      } else {
        await loadStatus();
      }
    } catch {
      setStatus({ success: false, error: "خطا در ارتباط با سرور" });
    } finally {
      setEnabling(false);
    }
  };

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const r = await fetch("/api/admin/ops/logs?lines=200");
      setLogs((await r.json()) as OpsLogs);
    } catch {
      setLogs({ success: false, error: "خطا در دریافت لاگ" });
    } finally {
      setLoadingLogs(false);
    }
  };

  const confirmDeploy = async () => {
    setDeployBusy(true);
    setDeployNote(null);
    try {
      const r = await fetch("/api/admin/ops/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const d = await r.json();
      if (!d.success) {
        setDeployNote(d.error ?? "استقرار شروع نشد");
        setDeployOpen(false);
      } else {
        setDeployOpen(false);
        setDeployNote(d.note ?? "استقرار شروع شد.");
        attemptsRef.current = 0;
        pollRef.current = setInterval(async () => {
          attemptsRef.current += 1;
          const s = await loadStatus();
          const running = Boolean(s?.deploy?.running);
          if (!running) {
            setDeployNote("استقرار پایان یافت؛ نتیجه در «آخرین خروجی استقرار» و تب «حسابرسی» ثبت شد.");
          } else if (attemptsRef.current > 180) {
            setDeployNote("پیگیری خودکار پس از ۳۰ دقیقه متوقف شد؛ وضعیت در کارت «استقرار» همچنان به‌روز می‌شود.");
          }
          if (!running || attemptsRef.current > 180) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }, 10_000);
      }
    } catch {
      setDeployNote("خطا در ارتباط با سرور");
      setDeployOpen(false);
    } finally {
      setDeployBusy(false);
    }
  };

  if (status && !status.success && status.error) {
    const disabled = status.code === "OPS_DISABLED" || status.error.includes("غیرفعال");
    return (
      <div className="space-y-4">
        <div className={`${card} border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-extrabold text-amber-800 dark:text-amber-200">
                {disabled ? "کنسول عملیات غیرفعال است" : "خطا"}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-amber-700/90 dark:text-amber-300/80">{status.error}</div>
            </div>
            {disabled && (
              <button onClick={enableConsole} disabled={enabling} className={btn}>
                {enabling ? "در حال فعال‌سازی…" : "فعال‌سازی کنسول عملیات"}
              </button>
            )}
          </div>
        </div>
        <div className={`${card}`}>
          <div className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            بعد از فعال‌سازی، این صفحه وضعیت سرور، دم لاگ سرویس و دکمهٔ استقرار را نشان می‌دهد. هر استقرار در تب «حسابرسی» ثبت می‌شود.
          </div>
        </div>
      </div>
    );
  }

  const s = status;
  const dbOk = s?.db?.ok === true;
  const deployRunning = Boolean(s?.deploy?.running);

  return (
    <div className="space-y-4">
      {/* کارت‌های وضعیت */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className={card}>
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">🖥️ سرور</h3>
          {s?.server ? (
            <div className="mt-3">
              <Row label="نود" value={s.server.node} />
              <Row label="محیط" value={s.server.env} />
              <Row label="میزبان" value={s.server.hostname} />
              <Row label="آپ‌تایم پروسه" value={fmtUptime(s.server.uptimeSec)} />
              <Row label="حافظه" value={`${toPersianDigits(s.server.memoryMb)} مگابایت`} />
              <Row label="pid" value={toPersianDigits(String(s.server.pid))} />
            </div>
          ) : (
            <div className="mt-3 text-xs text-neutral-400">در حال بارگذاری…</div>
          )}
        </div>

        <div className={card}>
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">🗄️ دیتابیس</h3>
          <div className="mt-3">
            {s?.db ? (
              <>
                <Row label="وضعیت" value={dbOk ? "سالم" : "خطا"} ok={dbOk} />
                <Row label="زمان پاسخ" value={`${toPersianDigits(String(s.db.ms))} میلی‌ثانیه`} />
                {s.db.error && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400" dir="ltr">{s.db.error}</div>}
              </>
            ) : (
              <div className="mt-3 text-xs text-neutral-400">در حال بارگذاری…</div>
            )}
          </div>
        </div>

        <div className={card}>
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">🌿 نسخه (گیت)</h3>
          <div className="mt-3">
            {s?.git ? (
              <>
                <Row label="شاخه" value={s.git.branch ?? "—"} />
                <Row label="آخرین کامیت" value={s.git.commit ?? "—"} />
              </>
            ) : (
              <div className="mt-3 text-xs text-neutral-400">در حال بارگذاری…</div>
            )}
          </div>
        </div>

        <div className={card}>
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">⚡ PM2</h3>
          <div className="mt-3">
            {s?.pm2?.available ? (
              (s.pm2.list ?? []).map((p) => (
                <Row key={p.name} label={p.name} value={`${p.status} — ری‌استارت: ${toPersianDigits(String(p.restarts))}`} ok={p.status === "online"} />
              ))
            ) : (
              <div className="mt-3 text-xs text-neutral-400">PM2 در دسترس نیست</div>
            )}
          </div>
        </div>

        <div className={card}>
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">💾 دیسک</h3>
          <div className="mt-3">
            {s?.disk && !s.disk.error ? (
              <>
                <Row label="پارتیشن" value={s.disk.mount ?? "—"} />
                <Row label="پرشدگی" value={`${s.disk.usePercent ?? "؟"}٪`} ok={Number(s.disk.usePercent ?? 100) < 90} />
                <Row label="آزاد" value={fmtKb(s.disk.availKb ?? 0)} />
              </>
            ) : (
              <div className="mt-3 text-xs text-neutral-400">{s?.disk?.error ?? "در حال بارگذاری…"}</div>
            )}
          </div>
        </div>

        <div className={card}>
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">🚀 استقرار</h3>
          <div className="mt-3">
            <Row label="وضعیت" value={deployRunning ? "در حال اجرا…" : "آماده"} ok={!deployRunning} />
            {s?.deploy?.cmd && <Row label="دستور" value={s.deploy.cmd} />}
            <button onClick={() => setDeployOpen(true)} disabled={deployRunning || deployBusy} className={`${btn} mt-3 w-full`}>
              اجرای استقرار
            </button>
            {deployNote && <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">{deployNote}</div>}
          </div>
        </div>
      </div>

      {/* دم لاگ آخرین استقرار */}
      {(s?.deploy?.tail?.length ?? 0) > 0 && (
        <div className={card}>
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">آخرین خروجی استقرار</h3>
          <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-neutral-950 p-4 text-[11px] leading-relaxed text-neutral-300" dir="ltr">
            {stripAnsi(s?.deploy?.tail?.join("\n") ?? "")}
          </pre>
        </div>
      )}

      {/* لاگ سرویس */}
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold text-neutral-900 dark:text-neutral-100">📜 لاگ سرویس</h3>
          <button onClick={loadLogs} disabled={loadingLogs} className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600">
            {loadingLogs ? "در حال دریافت…" : "دریافت دم لاگ"}
          </button>
        </div>
        {logs && (
          <div className="mt-3">
            {logs.success && logs.found && logs.lines ? (
              <pre className="max-h-96 overflow-auto rounded-xl bg-neutral-950 p-4 text-[11px] leading-relaxed text-neutral-300" dir="ltr">
                {stripAnsi(logs.lines.join("\n"))}
              </pre>
            ) : (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {logs.hint ?? logs.error ?? "لاگی برای نمایش نیست."}
              </div>
            )}
          </div>
        )}
      </div>

      {/* مودال تأیید دو مرحله‌ای استقرار */}
      {deployOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeployOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-base font-black text-neutral-900 dark:text-neutral-100">اجرای استقرار روی سرور</h3>
            <div className="mt-3 space-y-2 rounded-xl bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <div>⏱️ اجرای به‌روزرسانی چند دقیقه طول می‌کشد و در این مدت سایت و پنل چند بار قطع و وصل می‌شوند.</div>
              <div>🧾 پیش از تغییر دیتابیس، یک بکاپ کامل خودکار گرفته می‌شود و در صورت شکست، سرویس با نسخهٔ قبلی بالا می‌ماند.</div>
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs font-semibold leading-relaxed text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 accent-pink-600" />
              می‌دانم که سرویس چند دقیقه قطع می‌شود و این کار در حسابرسی ثبت خواهد شد.
            </label>
            <input
              className="mt-3 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              placeholder="برای تأیید، کلمهٔ «استقرار» را بنویسید"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDeployOpen(false)} className="rounded-xl bg-neutral-100 px-4 py-2.5 text-sm font-bold text-neutral-600 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300">
                انصراف
              </button>
              <button onClick={confirmDeploy} disabled={!ack || typed.trim() !== "استقرار" || deployBusy} className={btn}>
                {deployBusy ? "در حال ارسال…" : "اجرا کن"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
