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
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
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

/** لاگ فقط از ریشهٔ پروژه، لاگ‌های PM2 یا /var/log قابل خواندن است */
export function isAllowedLogPath(p: string): boolean {
  if (!isAbsolute(p)) return false;
  const roots = [opsAppRoot(), join(homeDir(), ".pm2", "logs"), "/var/log", "/root/.pm2/logs"];
  return roots.some((r) => p === r || p.startsWith(r.endsWith(sep) ? r : r + sep));
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

export function tailLines(path: string, n: number): string[] {
  const lines = readFileSync(path, "utf8").split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.slice(-n);
}

/* ─── استقرار ───────────────────────────────────────────────────────── */

interface DeployState {
  running: boolean;
  startedAt: number | null;
  pid: number | null;
  cmd: string | null;
}

export const deployState: DeployState = { running: false, startedAt: null, pid: null, cmd: null };

const DEPLOY_CMD_RE = /^[A-Za-z0-9_./-]+$/;
const DEPLOY_ARG_RE = /^--[a-z][a-z0-9-]*(=[0-9]+)?$/;

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
 * شروع استقرار. پردازه detached است تا ری‌استارت سرویس در میانهٔ اجرا
 * (pm2 restart داخل update.sh) خودِ استقرار را نکشد؛ خروجی به فایل لاگ
 * می‌رود و وضعیت از همان فایل + deployState خوانده می‌شود.
 */
export async function startDeploy(actor: OpsActor): Promise<Response> {
  const deployLimit = await numericSettingOrEnv("ops.console.deploy_per_hour", process.env.OPS_CONSOLE_DEPLOY_PER_HOUR, 3);
  if (deployLimit > 0) {
    const chk = checkRate(`ops-deploy:${actor.ip}`, deployLimit, 3600_000);
    if (!chk.ok) {
      return tooManyRequests(chk.retryAfterSec, "اجرای استقرار بیش از سقف مجاز در ساعت است؛ کمی بعد دوباره تلاش کنید.");
    }
  }
  if (deployState.running) {
    return json({ success: false, error: "یک استقرار همین حالا در حال اجراست؛ وضعیتش را در همین صفحه دنبال کنید." }, { status: 409 });
  }

  const rawCmd = (await getSetting("ops.console.deploy_cmd").catch(() => undefined))?.trim() || "deploy/update.sh";
  const parsed = parseDeployCmd(rawCmd);
  if ("error" in parsed) return json({ success: false, error: parsed.error }, { status: 400 });

  const logPath = opsDeployLogPath();
  mkdirSync(dirname(logPath), { recursive: true });
  const startedAt = Date.now();
  appendFileSync(
    logPath,
    `\n=== ops-deploy start ${new Date(startedAt).toISOString()} cmd=${rawCmd} actor=${actor.user.phone ?? actor.user.id} ===\n`,
    "utf8"
  );

  const fd = openSync(logPath, "a");
  const child = spawn("bash", [parsed.file, ...parsed.args], {
    cwd: opsAppRoot(),
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  child.on("error", (err) => {
    deployState.running = false;
    deployState.startedAt = null;
    deployState.pid = null;
    appendFileSync(logPath, `=== ops-deploy spawn error: ${err.message} ===\n`, "utf8");
  });
  child.on("exit", (code) => {
    deployState.running = false;
    deployState.startedAt = null;
    deployState.pid = null;
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

  deployState.running = true;
  deployState.startedAt = startedAt;
  deployState.pid = child.pid ?? null;
  deployState.cmd = rawCmd;
  child.unref();

  await logAudit({
    actorId: actor.user.id,
    actorPhone: actor.user.phone ?? undefined,
    action: "ops.deploy.start",
    entityType: "OpsConsole",
    after: { cmd: rawCmd, pid: child.pid ?? null },
    ip: actor.ip,
  }).catch(() => {});

  return json({
    success: true,
    started: true,
    pid: child.pid ?? null,
    cmd: rawCmd,
    note: "استقرار شروع شد. سرویس هنگام ری‌استارت پاسخ را قطع می‌کند؛ بعد از ۲ تا ۳ دقیقه همین صفحه را تازه کنید و وضعیت را از بخش «استقرار» دنبال کنید.",
  });
}
