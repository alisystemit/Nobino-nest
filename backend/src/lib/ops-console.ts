/**
 * کنسول عملیات — هستهٔ مشترک مسیرهای /api/admin/ops/*
 * (وضعیت سرور، دم لاگ، اجرای استقرار).
 *
 * قراردادهای امنیتی:
 *  - همهٔ مسیرها فقط با نقش ADMIN بازند و پشت گیت `ops.console.enabled`
 *    (سوییچ سوپرادمین در «تنظیمات سیستم») قرار دارند؛ خاموش = 403.
 *  - سقف نرخ جداگانه برای خواندن وضعیت/لاگ و سقف سخت‌تر برای اجرای استقرار.
 *  - دستور استقرار از ورودی کاربر ساخته نمی‌شود: از تنظیم `ops.console.deploy_cmd`
 *    (فقط ADMIN می‌تواند عوضش کند) خوانده و توکن‌به‌توکن اعتبارسنجی می‌شود؛
 *    spawn بدون shell است و خروجی به فایل لاگ می‌رود.
 *  - شروع/پایان هر استقرار در AuditLog ثبت می‌شود.
 */
import { execFile, spawn } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { User } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { checkRate, clientIpFromRequest, numericSettingOrEnv, tooManyRequests } from "@/lib/rate-limit-lite";
import { json, apiError } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

/** ریشهٔ پروژه روی سرور؛ قابل تغییر با OPS_CONSOLE_APP_ROOT در .env */
export const opsAppRoot = (): string => resolve((process.env.OPS_CONSOLE_APP_ROOT ?? "").trim() || process.cwd());

/** لاگ استقرار داخل پوشهٔ logs (gitignored و از بیرون سرو نمی‌شود) */
export const opsDeployLogPath = (): string => join(opsAppRoot(), "logs", "ops-deploy-last.log");

export async function opsEnabled(): Promise<boolean> {
  const raw = await getSetting("ops.console.enabled").catch(() => undefined);
  return String(raw ?? "").trim().toLowerCase() === "true";
}

export interface OpsActor {
  user: User;
  ip: string;
}

/**
 * گیت مشترک: ADMIN + سوییچ کنسول + سقف نرخ وضعیت/لاگ.
 * Response برگرداند یعنی همین را باید به کلاینت داد.
 */
export async function opsGate(req: Request): Promise<OpsActor | Response> {
  try {
    const user = await requireRole(["ADMIN"]);
    if (!(await opsEnabled())) {
      return json(
        {
          success: false,
          code: "OPS_DISABLED",
          error: "کنسول عملیات غیرفعال است. برای روشن‌کردن: «تنظیمات سیستم» ← «کنسول عملیات سرور» ← وضعیت را «فعال» کنید.",
        },
        { status: 403 }
      );
    }
    const ip = clientIpFromRequest(req);
    const limit = await numericSettingOrEnv("ops.console.rate_per_minute", process.env.OPS_CONSOLE_RATE_PER_MINUTE, 20);
    if (limit > 0) {
      const chk = checkRate(`ops:${ip}`, limit, 60_000);
      if (!chk.ok) {
        return tooManyRequests(chk.retryAfterSec, "درخواست‌های وضعیت/لاگ بیش از سقف مجاز است؛ کمی بعد دوباره تلاش کنید.");
      }
    }
    return { user, ip };
  } catch (err) {
    return apiError(err);
  }
}

/** اجرای دستور بدون shell با سقف زمانی و حجم خروجی */
export function runCmd(file: string, args: string[], timeoutMs = 8000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: "utf8" },
      (err, stdout, stderr) => (err ? reject(err) : resolvePromise({ stdout, stderr }))
    );
  });
}

/** پینگ دیتابیس (پرس‌وجوی ثابت — ورودی کاربر ندارد) */
export async function dbPing(): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return { ok: true, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, error: String((err as Error).message ?? err).slice(0, 300) };
  }
}

const homeDir = (): string => process.env.HOME || process.env.USERPROFILE || "/root";

/**
 * لاگ فقط از ریشهٔ پروژه، لاگ‌های PM2 یا /var/log قابل خواندن است.
 * مقایسه روی realpath انجام می‌شود تا لینک سمبلیک داخل پوشهٔ مجاز نتواند
 * به فایلی بیرون از آن اشاره کند.
 */
export function isAllowedLogPath(p: string): boolean {
  if (!isAbsolute(p)) return false;
  let real: string;
  try {
    real = realpathSync(p);
  } catch {
    return false;
  }
  const roots = [opsAppRoot(), join(homeDir(), ".pm2", "logs"), "/var/log", "/root/.pm2/logs"];
  for (const r of roots) {
    let realRoot: string;
    try {
      realRoot = realpathSync(r);
    } catch {
      continue;
    }
    if (real === realRoot || real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep)) return true;
  }
  return false;
}

/** فایل لاگ سرویس: OPS_CONSOLE_LOG_FILE ← لاگ خروجی PM2 ← لاگ خطای PM2 ← logs/backend.log */
export function resolveLogFile(): { path: string; found: boolean } {
  const explicit = (process.env.OPS_CONSOLE_LOG_FILE ?? "").trim();
  const candidates = explicit
    ? [explicit]
    : [
        join(homeDir(), ".pm2", "logs", "nobino-api-out.log"),
        join(homeDir(), ".pm2", "logs", "nobino-api-error.log"),
        join(opsAppRoot(), "logs", "backend.log"),
      ];
  for (const c of candidates) {
    if (isAllowedLogPath(c) && existsSync(c)) return { path: c, found: true };
  }
  return { path: candidates[0] ?? "", found: false };
}

/**
 * دم فایل لاگ با خواندنِ محدود: فقط ۲۵۶ کیلوبایت آخر فایل خوانده می‌شود
 * تا یک لاگ چندگیگابایتی حافظه و دیسک را فلج نکند.
 */
export function tailLines(path: string, n: number): string[] {
  const MAX_BYTES = 256 * 1024;
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const start = size > MAX_BYTES ? size - MAX_BYTES : 0;
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    const lines = buf.toString("utf8").split("\n");
    if (start > 0) lines.shift();
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.slice(-n);
  } finally {
    closeSync(fd);
  }
}

/* ─── استقرار ───────────────────────────────────────────────────────── */

const DEPLOY_CMD_RE = /^[A-Za-z0-9_./-]+$/;
const DEPLOY_ARG_RE = /^--[a-z][a-z0-9-]*(=[0-9]+)?$/;

export interface DeployLockInfo {
  running: boolean;
  startedAt: number | null;
  pid: number | null;
  cmd: string | null;
}

/** قفل روی دیسک تا وضعیت استقرار با ری‌استارت سرویس از بین نرود */
export const deployLockPath = (): string => join(opsAppRoot(), "logs", "ops-deploy.lock");

/** سقف سن قفل؛ استقرارهای طولانی‌تر از این را «مرده» فرض می‌کنیم */
const LOCK_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * خواندن وضعیت استقرار از قفل روی دیسک. قفل ناقص، قفل با پروسهٔ مرده یا
 * قفل پیرتر از سقف سن، آزاد (پاک) می‌شود تا استقرار بعدی گیر نکند.
 */
export function readDeployLock(): DeployLockInfo {
  const dir = deployLockPath();
  if (!existsSync(dir)) return { running: false, startedAt: null, pid: null, cmd: null };
  let pid: number | null = null;
  let startedAt: number | null = null;
  let cmd: string | null = null;
  try {
    const pidTxt = readFileSync(join(dir, "pid"), "utf8").trim();
    if (/^\d+$/.test(pidTxt)) pid = Number(pidTxt);
    const t = Date.parse(readFileSync(join(dir, "started"), "utf8").trim());
    if (!Number.isNaN(t)) startedAt = t;
    const cmdTxt = readFileSync(join(dir, "cmd"), "utf8").trim();
    if (cmdTxt) cmd = cmdTxt.slice(0, 300);
  } catch {
    /* قفل ناقص = نامعتبر */
  }
  const stale =
    (pid === null && startedAt === null) ||
    (pid !== null && !pidAlive(pid)) ||
    (startedAt !== null && Date.now() - startedAt > LOCK_MAX_AGE_MS);
  if (stale) {
    releaseDeployLock();
    return { running: false, startedAt: null, pid: null, cmd: null };
  }
  return { running: true, startedAt, pid, cmd };
}

export function releaseDeployLock(): void {
  const dir = deployLockPath();
  try {
    for (const f of ["pid", "started", "cmd"]) {
      try {
        unlinkSync(join(dir, f));
      } catch {
        /* فایل نبوده */
      }
    }
    rmdirSync(dir);
  } catch {
    /* قفل از قبل آزاد شده */
  }
}

/**
 * اعتبارسنجی توکن‌به‌توکن دستور استقرار: فقط یک مسیر نسبی .sh داخل پروژه
 * به‌همراه گزینه‌های --… مجاز است (هیچ متاکاراکتر shell رد نمی‌شود).
 */
export function parseDeployCmd(raw: string): { file: string; args: string[] } | { error: string } {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { error: "دستور استقرار خالی است." };
  if (tokens.length > 8 || raw.length > 300) return { error: "دستور استقرار بیش از حد طولانی است." };
  const [file, ...args] = tokens;
  if (!DEPLOY_CMD_RE.test(file) || !file.endsWith(".sh")) {
    return { error: "مسیر اسکریپت استقرار نامعتبر است (فقط مسیر نسبی داخل پروژه با پسوند .sh)." };
  }
  const abs = resolve(opsAppRoot(), file);
  if (abs !== opsAppRoot() && !abs.startsWith(opsAppRoot() + sep)) {
    return { error: "اسکریپت استقرار باید داخل پوشهٔ پروژه باشد." };
  }
  for (const a of args) {
    if (!DEPLOY_ARG_RE.test(a)) return { error: `آرگومان نامعتبر: ${a} (فقط گزینه‌های --… مجازند).` };
  }
  return { file: abs, args };
}

/**
 * شروع استقرار. استقرار واقعی را اسکریپت مشترک scripts/ops-deploy-runner.sh
 * اجرا می‌کند (پردازهٔ detached تا ری‌استارت سرویس در میانهٔ راه — pm2 restart
 * داخل update.sh — خودِ استقرار را نکشد)؛ خروجی به فایل لاگ می‌رود، قفل روی
 * دیسک نگه داشته می‌شود و پایانِ واقعی را همان اسکریپت ثبت و آزاد می‌کند.
 */
export async function startDeploy(actor: OpsActor): Promise<Response> {
  const deployLimit = await numericSettingOrEnv("ops.console.deploy_per_hour", process.env.OPS_CONSOLE_DEPLOY_PER_HOUR, 3);
  if (deployLimit > 0) {
    const chk = checkRate(`ops-deploy:${actor.ip}`, deployLimit, 3600_000);
    if (!chk.ok) {
      return tooManyRequests(chk.retryAfterSec, "اجرای استقرار بیش از سقف مجاز در ساعت است؛ کمی بعد دوباره تلاش کنید.");
    }
  }
  if (readDeployLock().running) {
    return json({ success: false, error: "یک استقرار همین حالا در حال اجراست؛ وضعیتش را در همین صفحه دنبال کنید." }, { status: 409 });
  }

  const rawCmd = (await getSetting("ops.console.deploy_cmd").catch(() => undefined))?.trim() || "deploy/update.sh";
  const parsed = parseDeployCmd(rawCmd);
  if ("error" in parsed) return json({ success: false, error: parsed.error }, { status: 400 });

  const runner = join(opsAppRoot(), "scripts", "ops-deploy-runner.sh");
  if (!existsSync(runner)) {
    return json({ success: false, error: "اسکریپت اجراکنندهٔ استقرار (scripts/ops-deploy-runner.sh) در پروژه پیدا نشد." }, { status: 500 });
  }

  const logPath = opsDeployLogPath();
  mkdirSync(dirname(logPath), { recursive: true });
  const startedAt = Date.now();
  appendFileSync(
    logPath,
    `\n=== ops-deploy start ${new Date(startedAt).toISOString()} cmd=${rawCmd} actor=${actor.user.phone ?? actor.user.id} ===\n`,
    "utf8"
  );

  const lockDir = deployLockPath();
  try {
    mkdirSync(lockDir);
  } catch {
    return readDeployLock().running
      ? json({ success: false, error: "یک استقرار همین حالا در حال اجراست؛ وضعیتش را در همین صفحه دنبال کنید." }, { status: 409 })
      : json({ success: false, error: "قفل استقرار درست ساخته نشد؛ چند لحظه بعد دوباره تلاش کنید." }, { status: 409 });
  }
  writeFileSync(join(lockDir, "started"), new Date(startedAt).toISOString(), "utf8");
  writeFileSync(join(lockDir, "cmd"), rawCmd.slice(0, 300), "utf8");

  const fd = openSync(logPath, "a");
  let childPid: number | null = null;
  try {
    const child = spawn("bash", [runner, lockDir, parsed.file, ...parsed.args], {
      cwd: opsAppRoot(),
      detached: true,
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    });
    childPid = child.pid ?? null;
    // pid واقعی اجراکننده است (نه خودِ سرور) تا بعد از ری‌استارت سرویس،
    // بررسی «پروسه زنده است» همچنان درست جواب بدهد.
    writeFileSync(join(lockDir, "pid"), String(childPid ?? process.pid), "utf8");
    child.on("error", (err) => {
      releaseDeployLock();
      appendFileSync(logPath, `=== ops-deploy spawn error: ${err.message} ===\n`, "utf8");
    });
    child.on("exit", (code) => {
      appendFileSync(logPath, `\n=== ops-deploy end ${new Date().toISOString()} exit=${code} ===\n`, "utf8");
      logAudit({
        actorId: actor.user.id,
        actorPhone: actor.user.phone ?? undefined,
        action: "ops.deploy.finish",
        entityType: "OpsConsole",
        after: { cmd: rawCmd, exit: code },
        ip: actor.ip,
      }).catch(() => {});
    });
    child.unref();
  } catch (err) {
    releaseDeployLock();
    try {
      closeSync(fd);
    } catch {
      /* fd از قبل بسته */
    }
    return json({ success: false, error: `اجرای استقرار شروع نشد: ${(err as Error).message}` }, { status: 500 });
  }
  try {
    closeSync(fd);
  } catch {
    /* fd از قبل بسته */
  }

  await logAudit({
    actorId: actor.user.id,
    actorPhone: actor.user.phone ?? undefined,
    action: "ops.deploy.start",
    entityType: "OpsConsole",
    after: { cmd: rawCmd, pid: childPid },
    ip: actor.ip,
  }).catch(() => {});

  return json({
    success: true,
    started: true,
    pid: childPid,
    cmd: rawCmd,
    note: "استقرار شروع شد. سرویس هنگام ری‌استارت پاسخ را قطع می‌کند؛ بعد از ۲ تا ۳ دقیقه همین صفحه را تازه کنید و وضعیت را از بخش «استقرار» دنبال کنید.",
  });
}
