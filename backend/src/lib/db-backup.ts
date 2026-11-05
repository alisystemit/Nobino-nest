/**
 * پشتیبان‌گیری و بازگردانی دیتابیس از داخل پنل سوپرادمین.
 *
 * دو موتور، یک پوشه و یک قالب `.meta` (مشترک با `deploy/update.sh`):
 *
 *  ۱) موتور `pg` — اگر `pg_dump`/`pg_restore` روی سرور باشد، خروجی
 *     custom-format در `backups/nobino-<commit>-<زمان>.dump` نوشته می‌شود؛
 *     دقیقاً همان فایلی که اسکریپت دپلوی می‌سازد، پس بکاپ پنل با
 *     `deploy/update.sh --rollback=/path` هم برگردانده می‌شود و برعکس.
 *
 *  ۲) موتور `json` — وقتی باینری وجود ندارد (Postgres embedded، هاست
 *     اشتراکی). داده با SQL ساختارمند خوانده و در
 *     `nobino-<commit>-<زمان>.json.gz` فشرده می‌شود. مزیت مهم: بازگردانی
 *     در **یک تراکنش** انجام می‌شود، تا لحظهٔ commit هیچ کاربری نیمی از
 *     دادهٔ جدید را نمی‌بیند و با هر خطا دیتابیس دست‌نخورده می‌ماند.
 *
 * خروجی متنی همهٔ ستون‌ها (`col::text`) و ورود با کست صریح
 * (`$1::<نوعِ زنده>`) عمداً یکنواخت است: با این کار jsonb، آرایه، enum،
 * uuid، timestamp و bytea بدون حدس‌زدن نوع توسط درایور دقیقاً round-trip
 * می‌شوند (بررسی شد: `logs/probe-roundtrip.mjs`).
 *
 * امنیت:
 *  - نام فایل باید الگوی سخت `BACKUP_NAME_RE` را پاس کند و realpath‌اش
 *    داخل پوشهٔ بکاپ بماند (نه `../`، نه symlink به بیرون).
 *  - `DATABASE_URL` (با رمز) هرگز به کلاینت نمی‌رود؛ فقط نام دیتابیس،
 *    میزبان، پورت و نشانی ماسک‌شده. پیام‌های خطا هم پاک‌سازی می‌شوند.
 *  - یک عملیات در هر لحظه (قفل درون‌فرایندی) + ثبت در `AuditLog` (توسط روت).
 */
import { spawn, spawnSync } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createGzip, gunzipSync } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetting, updateSetting } from "@/lib/settings";

export type BackupEngine = "pg" | "json";
export type BackupKind = "manual" | "pre-restore" | "deploy";

export interface BackupColumn {
  name: string;
  /** نوع SQL از `format_type` — موقع بازگردانی دوباره از schema زنده خوانده می‌شود */
  type: string;
}

export interface BackupEntry {
  /** basename فایل — تنها شناسه‌ای که در URLها می‌چرخد */
  name: string;
  engine: BackupEngine;
  kind: BackupKind;
  bytes: number;
  createdAt: string;
  commit: string;
  branch: string;
  db: string;
  label: string;
  tables: number;
  rows: number;
  actor: string;
}

export interface BackupJob {
  id: string;
  kind: "create" | "restore";
  status: "running" | "done" | "failed";
  engine: BackupEngine;
  startedAt: string;
  finishedAt?: string;
  message: string;
  target: string;
}

/* ── نام‌ها و مسیرها ───────────────────────────────────────────────────── */

/** الگوی سخت نام بکاپ — همان قالبی که `deploy/update.sh` می‌سازد. */
export const BACKUP_NAME_RE = /^nobino-[A-Za-z0-9][A-Za-z0-9._-]{0,80}-(\d{8}-\d{6})\.(dump|json\.gz)$/;

/** ریشهٔ مخزن: در بیلد `backend/dist/lib` → سه سطح بالا؛ fallbackها برای dev/داکر. */
export function repoRoot(): string {
  const candidates = [
    resolve(__dirname, "..", "..", ".."),
    resolve(__dirname, "..", "..", "..", ".."),
    resolve(process.cwd()),
    resolve(process.cwd(), ".."),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "prisma", "schema.prisma"))) return dir;
  }
  return resolve(process.cwd());
}

/** پوشهٔ بکاپ: override تست → `BACKUP_DIR` → `backups/` کنار مخزن (gitignored). */
export function backupsDir(): string {
  const override = String((globalThis as { __NOBINO_BACKUP_DIR__?: string }).__NOBINO_BACKUP_DIR__ ?? "").trim();
  const env = (override || process.env.BACKUP_DIR || "").trim();
  return resolve(env || join(repoRoot(), "backups"));
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function badName(): Error & { status: number } {
  return Object.assign(new Error("نام فایل بکاپ معتبر نیست."), { status: 400 });
}

function sep(): string {
  return process.platform === "win32" ? "\\" : "/";
}

function realpathOr(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    // فایل هنوز نوشته نشده: پوشهٔ والد را واقعی کن و نام را بچسبان
    const base = p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
    const parent = resolve(p, "..");
    try {
      return join(realpathSync(parent), base);
    } catch {
      return resolve(p);
    }
  }
}

/**
 * نام امن: الگو + ماندن درون پوشه. `realpathSync` پوشه را باز می‌کند تا
 * symlink به بیرون (مثلاً `backups/x.dump -> /etc/passwd`) کار نکند.
 */
export function resolveBackupPath(name: string, dir = backupsDir()): string {
  if (!BACKUP_NAME_RE.test(name)) throw badName();
  const realDir = realpathOr(dir);
  const abs = join(realDir, name);
  if (!abs.startsWith(realDir + sep())) throw badName();
  if (existsSync(abs) && realpathSync(abs) !== abs) throw badName();
  return abs;
}

/** فقط basename — تا پیام‌های خطا مسیر مطلق سرور را لو ندهند */
export function safeFileLabel(name: string): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  return base.slice(0, 120);
}

/* ── نشانی دیتابیس (هیچ‌وقت با رمز به کلاینت نمی‌رود) ──────────────────── */

export function dbUrl(): string {
  return String(process.env.DATABASE_URL ?? "").trim();
}

/** نشانی خالصِ libpq — Prisma query string را pg_dump/pg_restore نمی‌فهمند */
export function dbTarget(): string {
  return dbUrl().split("?")[0];
}

/** `postgresql://u:p@h:5433/db` → `postgresql://u:***@h:5433/db` */
export function maskDbUrl(raw: string): string {
  const u = String(raw ?? "").trim();
  const m = /^([^:/]+:\/\/)([^@]*)@([^@]+)$/.exec(u);
  if (!m) return u;
  const userinfo = m[2];
  if (!userinfo.includes(":")) return u;
  return `${m[1]}${userinfo.slice(0, userinfo.indexOf(":"))}:***@${m[3]}`;
}

export function dbInfo(): { db: string; host: string; port: string; masked: string } {
  const target = dbTarget();
  try {
    const u = new URL(target);
    return { db: decodeURIComponent(u.pathname.replace(/^\//, "")), host: u.hostname, port: u.port, masked: maskDbUrl(target) };
  } catch {
    return { db: "", host: "", port: "", masked: "" };
  }
}

/** هر رشته‌ای که به سمت کاربر می‌رود باید از اینجا عبور کند */
export function sanitize(text: string): string {
  let out = String(text ?? "");
  const target = dbTarget();
  if (target) out = out.split(target).join(maskDbUrl(target));
  out = out.replace(/([a-z][a-z0-9+.-]*:\/\/[^:@/\s]+):[^@\s]{1,256}@/gi, (_m, head: string) => `${head}:***@`);
  let pass = "";
  try {
    pass = decodeURIComponent(new URL(dbUrl()).password ?? "");
  } catch {
    pass = "";
  }
  if (pass.length >= 4) out = out.split(pass).join("***");
  return out;
}

function fail(message: string, status = 500): Error & { status: number } {
  return Object.assign(new Error(sanitize(message)), { status });
}

/* ── تشخیص موتور ───────────────────────────────────────────────────────── */

const binCache = new Map<string, boolean>();

function hasBinary(name: string): boolean {
  const key = `${name}\u0000${process.env.PG_BIN_DIR ?? ""}`;
  const hit = binCache.get(key);
  if (hit !== undefined) return hit;
  const dir = String(process.env.PG_BIN_DIR ?? "").trim();
  const tries = dir ? [join(dir, name), name] : [name];
  let found = false;
  for (const bin of tries) {
    try {
      const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 8000 });
      if (!r.error && r.status === 0) {
        found = true;
        break;
      }
    } catch {
      /* ادامه */
    }
  }
  binCache.set(key, found);
  return found;
}

export function pgToolsAvailable(): boolean {
  return hasBinary("pg_dump") && hasBinary("pg_restore");
}

async function enginePreference(): Promise<"auto" | "pg" | "json"> {
  let raw = "";
  try {
    raw = String((await getSetting("backups.engine")) ?? "").trim().toLowerCase();
  } catch {
    raw = "";
  }
  if (!raw) raw = String(process.env.BACKUP_ENGINE ?? "").trim().toLowerCase();
  return raw === "pg" || raw === "json" ? raw : "auto";
}

/** موتور فعال: تنظیم `backups.engine` (پنل) → متغیر محیطی → auto */
export async function activeEngine(): Promise<BackupEngine> {
  const pref = await enginePreference();
  if (pref === "json") return "json";
  if (pref === "pg") return "pg";
  return pgToolsAvailable() ? "pg" : "json";
}

export async function setEnginePreference(pref: "auto" | "pg" | "json"): Promise<void> {
  await updateSetting("backups.engine", pref, { group: "backups", type: "string" });
}

export async function keepCount(): Promise<number> {
  let raw: string | undefined;
  try {
    raw = await getSetting("backups.keep");
  } catch {
    raw = undefined;
  }
  const n = Number(String(raw ?? "").trim());
  if (Number.isFinite(n) && n >= 1 && n <= 200) return Math.floor(n);
  const env = Number(String(process.env.BACKUP_KEEP ?? "").trim());
  if (Number.isFinite(env) && env >= 1 && env <= 200) return Math.floor(env);
  return 10;
}

export async function setKeep(n: number): Promise<void> {
  if (!Number.isFinite(n) || n < 1 || n > 200) throw fail("تعداد نگه‌داشتن باید عددی بین ۱ تا ۲۰۰ باشد.", 400);
  await updateSetting("backups.keep", String(Math.floor(n)), { group: "backups", type: "number" });
}

/* ── متادیتا (هم‌قالب با deploy/update.sh) ─────────────────────────────── */

export function serializeMeta(fields: Record<string, string | number | undefined>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && String(v) !== "")
    .map(([k, v]) => `${k}=${String(v).replace(/[\r\n]+/g, " ").trim()}`);
  return lines.join("\n") + "\n";
}

export function parseMeta(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function git(args: string[]): string {
  try {
    const r = spawnSync("git", ["-C", repoRoot(), ...args], { encoding: "utf8", timeout: 5000 });
    if (!r.error && r.status === 0) return r.stdout.trim() || "-";
  } catch {
    /* git نصب نیست */
  }
  return "-";
}

export function commitNow(): string {
  return git(["rev-parse", "--short", "HEAD"]);
}

function branchNow(): string {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

/** `20261105-131415` در UTC — دقیقاً همان قالب update.sh */
export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/**
 * نام تازه در همان قالب سخت. اگر دو بکاپ در یک ثانیه خواسته شود به ثانیهٔ
 * بعد می‌رویم (پسوند اضافه، قالب نامِ update.sh را می‌شکست).
 * برچسب کامیت باید همیشه یک کاراکتر مجاز در ابتدا داشته باشد؛ اگر git نباشد
 * یا خروجی «-» بدهد از `local` استفاده می‌کنیم وگرنه نام با BACKUP_NAME_RE
 * نمی‌خواند و بکاپ در فهرست دیده نمی‌شود.
 */
function uniqueName(dir: string, ext: "dump" | "json.gz", commit: string): string {
  const token =
    String(commit ?? "")
      .replace(/[^A-Za-z0-9._-]/g, "-")
      .replace(/^[^A-Za-z0-9]+/, "")
      .slice(0, 80) || "local";
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = `nobino-${token}-${stamp()}.${ext}`;
    if (!existsSync(join(dir, name))) return name;
    const until = Date.now() + 1050;
    while (Date.now() < until) {
      /* busy-wait کوتاه؛ فقط در برخورد ثانیه‌ای */
    }
  }
  throw fail("ساخت نام بکاپ ممکن نشد (چند بکاپ در یک ثانیه).");
}

/* ── قفل و مشاغل ───────────────────────────────────────────────────────── */

let busy: { jobId: string; kind: BackupJob["kind"]; startedAt: number } | null = null;
const jobHistory: BackupJob[] = [];
let jobSeq = 0;

function startJob(kind: BackupJob["kind"], engine: BackupEngine, target: string): BackupJob {
  const job: BackupJob = {
    id: `j${Date.now().toString(36)}${++jobSeq}`,
    kind,
    status: "running",
    engine,
    startedAt: new Date().toISOString(),
    message: kind === "create" ? "در حال خواندن جداول…" : "در حال بازگردانی…",
    target,
  };
  jobHistory.unshift(job);
  if (jobHistory.length > 12) jobHistory.length = 12;
  busy = { jobId: job.id, kind, startedAt: Date.now() };
  return job;
}

function finishJob(job: BackupJob, status: "done" | "failed", message: string): void {
  job.status = status;
  job.message = sanitize(message).slice(0, 400);
  job.finishedAt = new Date().toISOString();
  if (busy?.jobId === job.id) busy = null;
}

export function currentJob(): BackupJob | null {
  const id = busy?.jobId;
  return id ? jobHistory.find((j) => j.id === id) ?? null : null;
}

export function recentJobs(): BackupJob[] {
  return jobHistory.slice(0, 6);
}

/** اگر عملیات دیگری در جریان باشد 409 — دو بازگردانی هم‌زمان فاجعه است */
export function assertIdle(): void {
  if (busy) {
    const secs = Math.round((Date.now() - busy.startedAt) / 1000);
    throw fail(`یک عملیات دیگر در جریان است (${busy.kind}؛ ${secs} ثانیه پیش). صبر کنید و دوباره تلاش کنید.`, 409);
  }
}

/* ── فهرست ─────────────────────────────────────────────────────────────── */

function engineOf(name: string, meta: Record<string, string>): BackupEngine {
  if (meta.engine === "pg" || meta.engine === "json") return meta.engine;
  return name.endsWith(".dump") ? "pg" : "json";
}

function kindOf(meta: Record<string, string>): BackupKind {
  if (meta.kind === "manual" || meta.kind === "pre-restore" || meta.kind === "deploy") return meta.kind;
  // بکاپ‌های اسکریپت دپلوی فقط commit/branch/db/bytes/utc را دارند
  return meta.engine ? "manual" : "deploy";
}

export async function listBackups(): Promise<BackupEntry[]> {
  const dir = backupsDir();
  if (!existsSync(dir)) return [];
  const out: BackupEntry[] = [];
  for (const name of readdirSync(dir).filter((f) => BACKUP_NAME_RE.test(f))) {
    const abs = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    let meta: Record<string, string> = {};
    try {
      meta = parseMeta(readFileSync(`${abs}.meta`, "utf8"));
    } catch {
      meta = {};
    }
    const m = /-(\d{8})-(\d{6})\.(?:dump|json\.gz)$/.exec(name);
    const createdAt = m
      ? `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4, 6)}Z`
      : new Date(st.mtimeMs).toISOString();
    const commitFromName = name.replace(/^nobino-/, "").replace(/-\d{8}-\d{6}\.(dump|json\.gz)$/, "");
    out.push({
      name,
      engine: engineOf(name, meta),
      kind: kindOf(meta),
      bytes: Number(meta.bytes) || st.size,
      createdAt,
      commit: meta.commit || commitFromName || "-",
      branch: meta.branch || "-",
      db: meta.db || dbInfo().db,
      label: meta.label || "",
      tables: Number(meta.tables) || 0,
      rows: Number(meta.rows) || 0,
      actor: meta.actor || "",
    });
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

/** چرخش: تازه‌ترین‌ها می‌مانند؛ dump و json.gz و metaهای یتیم پاک می‌شوند */
export async function rotate(): Promise<string[]> {
  const dir = backupsDir();
  if (!existsSync(dir)) return [];
  const keep = await keepCount();
  const all = readdirSync(dir)
    .filter((f) => BACKUP_NAME_RE.test(f))
    .map((f) => ({ f, t: statTime(join(dir, f)) }))
    .sort((a, b) => b.t - a.t);
  const removed: string[] = [];
  for (const { f } of all.slice(Math.max(1, keep))) {
    for (const p of [join(dir, f), join(dir, `${f}.meta`)]) {
      try {
        rmSync(p, { force: true });
      } catch {
        /* دسترسی سرور ممکن است پاک‌کردن را نگه دارد */
      }
    }
    removed.push(f);
  }
  return removed;
}

function statTime(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/* ── طرح جداول (موتور json) ────────────────────────────────────────────── */

interface ColumnRow {
  attname: string;
  type: string;
  gen: string;
}

interface TablePlan {
  name: string;
  columns: BackupColumn[];
  insertable: BackupColumn[];
  rowCount: number;
}

/** اتصال قابل‌استفاده برای کوئری خام (کل client یا client داخل تراکنش) */
type Sql = {
  $queryRawUnsafe<T = unknown>(sql: string, ...params: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...params: unknown[]): Promise<number>;
};

export function q(id: string): string {
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function tableNames(tx: Sql): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return rows.map((r) => r.tablename);
}

async function columnsOf(tx: Sql, name: string): Promise<ColumnRow[]> {
  return tx.$queryRawUnsafe<ColumnRow[]>(
    `SELECT a.attname,
            format_type(a.atttypid, a.atttypmod) AS type,
            a.attgenerated AS gen
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1
        AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    name,
  );
}

/** همهٔ ستون‌ها متنی، bytea هگز. این یکنواختی عمداً است (سر فایل توضیح آمده). */
function selectExpr(col: BackupColumn): string {
  return col.type === "bytea" ? `encode(${q(col.name)}, 'hex') AS ${q(col.name)}` : `${q(col.name)}::text AS ${q(col.name)}`;
}

function insertExpr(col: BackupColumn, idx: number): string {
  const p = `$${idx}`;
  // `decode($n,'hex')` بدون کاست، نوع پارامتر را نمی‌تواند حدس بزند (42P18)
  return col.type === "bytea" ? `decode(${p}::text, 'hex')` : `${p}::${col.type}`;
}

/**
 * `pg_attribute.attgenerated` از نوع `"char"` است و درایور نود آن را برای
 * «ستون محاسبه‌شده نیست» رشتهٔ خالیِ یک‌بایتی (`"\u0000"`) برمی‌گرداند، نه `""`.
 * مقایسه با `""` همهٔ ستون‌ها را «generated» می‌کرد و درج هیچ جدولی انجام
 * نمی‌شد. پس هر چیزی جز `s` (stored) و `d` (dynamic) قابل درج است.
 */
function insertableColumn(col: ColumnRow): boolean {
  const g = String(col.gen ?? "").replace(/\u0000/g, "").trim();
  return g !== "s" && g !== "d";
}

/**
 * جملهٔ INSERT چندردیفی: هر مقدار placeholder یکتا دارد ($1…$n×ردیف).
 * تکرار یک tuple (خطای قبلی همین تابع) پارامترهای بی‌مرجع می‌سازد و
 * PostgreSQL با `42P18 could not determine data type of parameter` رد می‌شود.
 */
export function multiRowInsert(table: string, cols: { attname: string; type: string }[], rowCount: number): string {
  const perRow = Math.max(1, cols.length);
  const colList = cols.map((c) => q(c.attname)).join(", ");
  const tuples = Array.from({ length: Math.max(0, rowCount) }, (_v, ri) =>
    `(${cols.map((c, i) => insertExpr({ name: c.attname, type: c.type }, ri * perRow + i + 1)).join(", ")})`,
  ).join(", ");
  return `INSERT INTO ${q(table)} (${colList}) VALUES ${tuples}`;
}

async function planTables(tx: Sql): Promise<TablePlan[]> {
  const plans: TablePlan[] = [];
  for (const name of await tableNames(tx)) {
    const cols = await columnsOf(tx, name);
    plans.push({
      name,
      columns: cols.map((c) => ({ name: c.attname, type: c.type })),
      insertable: cols.filter(insertableColumn).map((c) => ({ name: c.attname, type: c.type })),
      rowCount: num(await tx.$queryRawUnsafe<{ n: bigint | number }[]>(`SELECT count(*) AS n FROM ${q(name)}`)),
    });
  }
  return plans;
}

function num(rows: { n: bigint | number }[] | undefined): number {
  const n = Number(rows?.[0]?.n ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * ترتیب درج: والد پیش از فرزند. حلقهٔ FK (یا جدول خودارجاع) را با پذیرش
 * جدول‌های باقی‌مانده در همان نقطه می‌شکنیم و به کاربر گزارش می‌دهیم.
 */
export async function orderedTablesForInsert(tx: Sql): Promise<{ order: string[]; cycles: string[] }> {
  const names = await tableNames(tx);
  const set = new Set(names);
  const deps = new Map<string, Set<string>>(names.map((n) => [n, new Set<string>()]));
  const fks = await tx.$queryRawUnsafe<{ child: string; parent: string }[]>(
    `SELECT fc.relname AS child, fp.relname AS parent
       FROM pg_constraint c
       JOIN pg_class fc ON fc.oid = c.conrelid
       JOIN pg_class fp ON fp.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
  for (const fk of fks) {
    if (!set.has(fk.child) || !set.has(fk.parent) || fk.child === fk.parent) continue;
    deps.get(fk.child)?.add(fk.parent);
  }
  const order: string[] = [];
  const done = new Set<string>();
  const rest = [...names];
  while (rest.length) {
    const next = rest.find((n) => [...(deps.get(n) ?? [])].every((p) => done.has(p)));
    if (!next) {
      const cycles = [...rest];
      for (const n of rest) {
        order.push(n);
        done.add(n);
      }
      return { order, cycles };
    }
    order.push(next);
    done.add(next);
    rest.splice(rest.indexOf(next), 1);
  }
  return { order, cycles: [] };
}

/* ── نوشتن بکاپ (هسته، بدون قفل) ───────────────────────────────────────── */

interface DumpResult {
  name: string;
  bytes: number;
  tables: number;
  rows: number;
  engine: BackupEngine;
  commit: string;
  branch: string;
}

export interface WriteOptions {
  label?: string;
  kind?: BackupKind;
  actor?: string;
  engine?: BackupEngine;
  onMessage?: (msg: string) => void;
}

/** سقف ردیف برای موتور json — بالاتر از آن باید pg_dump نصب باشد */
const JSON_ROW_LIMIT = 300_000;

async function writeDump(opts: WriteOptions): Promise<DumpResult> {
  const engine = opts.engine ?? (await activeEngine());
  const dir = backupsDir();
  ensureDir(dir);
  const commit = commitNow();
  const branch = branchNow();
  const built = engine === "pg" ? await writePgDump(dir, commit, opts) : await writeJsonDump(dir, commit, opts);
  const meta = serializeMeta({
    commit,
    branch,
    db: dbInfo().db,
    bytes: built.bytes,
    utc: new Date().toISOString(),
    engine: built.engine,
    kind: opts.kind ?? "manual",
    tables: built.tables,
    rows: built.rows,
    actor: opts.actor ?? "",
    label: (opts.label ?? "").slice(0, 90),
  });
  writeFileSync(join(dir, `${built.name}.meta`), meta, "utf8");
  return built;
}

function entryOf(dump: DumpResult, opts: WriteOptions): BackupEntry {
  return {
    name: dump.name,
    engine: dump.engine,
    kind: opts.kind ?? "manual",
    bytes: dump.bytes,
    createdAt: new Date().toISOString(),
    commit: dump.commit,
    branch: dump.branch,
    db: dbInfo().db,
    label: opts.label ?? "",
    tables: dump.tables,
    rows: dump.rows,
    actor: opts.actor ?? "",
  };
}

async function writePgDump(dir: string, commit: string, opts: WriteOptions): Promise<DumpResult> {
  const target = dbTarget();
  if (!target) throw fail("DATABASE_URL پیدا نشد؛ بکاپ pg ممکن نیست.");
  const name = uniqueName(dir, "dump", commit);
  const abs = join(dir, name);
  opts.onMessage?.("pg_dump…");
  const { code, stderr } = await run("pg_dump", ["--no-owner", "--no-privileges", "--format=custom", `--file=${abs}`, `--dbname=${target}`], {});
  const bytes = existsSync(abs) ? statSync(abs).size : 0;
  if (code !== 0 || bytes < 1) {
    try {
      rmSync(abs, { force: true });
    } catch {
      /* پاک‌نشدن مهم نیست */
    }
    throw fail(`pg_dump ناموفق بود (کد ${code}). ${tail(stderr)}`);
  }
  return { name, bytes, tables: 0, rows: 0, engine: "pg", commit, branch: branchNow() };
}

async function writeJsonDump(dir: string, commit: string, opts: WriteOptions): Promise<DumpResult> {
  const name = uniqueName(dir, "json.gz", commit);
  const abs = join(dir, name);
  const tmp = `${abs}.part`;
  let total = 0;
  let tableCount = 0;

  const ws = createWriteStream(tmp);
  let streamError: Error | null = null;
  ws.on("error", (e) => {
    streamError = e;
  });
  try {
    await withSnapshotTx(async (tx) => {
      const plans = await planTables(tx);
      total = plans.reduce((s, p) => s + p.rowCount, 0);
      tableCount = plans.length;
      if (total > JSON_ROW_LIMIT) {
        throw fail(
          `حجم داده (${total.toLocaleString("en-US")} ردیف) برای موتور JSON زیاد است. روی سرور «postgresql-client» نصب کنید تا بکاپ pg_dump گرفته شود.`,
        );
      }
      await writeLine(ws, JSON.stringify(headOf(plans, total)));
      for (const plan of plans) {
        if (streamError) throw streamError;
        opts.onMessage?.(`خواندن ${plan.name} (${plan.rowCount.toLocaleString("en-US")} ردیف)…`);
        const select = plan.columns.map(selectExpr).join(", ");
        const rows = await tx.$queryRawUnsafe<Record<string, string | null>[]>(`SELECT ${select} FROM ${q(plan.name)}`);
        await writeLine(ws, JSON.stringify({ table: plan.name, rows }));
      }
    });
    if (streamError) throw streamError;
    await closeStream(ws);
    opts.onMessage?.("فشرده‌سازی…");
    await pipeline(createReadStream(tmp), createGzip(), createWriteStream(abs));
    rmSync(tmp, { force: true });
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
      if (existsSync(abs)) rmSync(abs, { force: true });
    } catch {
      /*.best effort */
    }
    throw err;
  }
  return { name, bytes: statSync(abs).size, tables: tableCount, rows: total, engine: "json", commit, branch: branchNow() };
}

function headOf(plans: TablePlan[], total: number) {
  return {
    format: "nobino-db-backup",
    version: 1,
    engine: "json" as const,
    generatedAt: new Date().toISOString(),
    db: dbInfo().db,
    rows: total,
    tables: plans.map((p) => ({ name: p.name, columns: p.columns, rowCount: p.rowCount })),
  };
}

/**
 * خواندن در یک تراکنش تکرارپذیر: بدون snapshot، جدول‌ها در لحظه‌های
 * متفاوتی خوانده می‌شوند و مرجع شکسته به‌دست می‌آید که موقع بازگردانی
 * با نقض کلید بیرونی می‌شکند.
 */
async function withSnapshotTx(fn: (tx: Sql) => Promise<void>): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL extra_float_digits = 3`).catch(() => undefined);
      await fn(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15 * 60 * 1000, maxWait: 10_000 },
  );
}

function writeLine(ws: import("node:fs").WriteStream, text: string): Promise<void> {
  return new Promise((res, rej) => {
    if (ws.write(`${text}\n`)) return res();
    ws.once("drain", () => res());
    ws.once("error", rej);
  });
}

function closeStream(ws: import("node:fs").WriteStream): Promise<void> {
  return new Promise((res, rej) => ws.end((e?: Error) => (e ? rej(e) : res())));
}

/* ── خواندن فایل json ──────────────────────────────────────────────────── */

interface DumpHead {
  format: string;
  version: number;
  db: string;
  rows: number;
  tables: { name: string; columns: BackupColumn[]; rowCount: number }[];
}

interface JsonDump {
  head: DumpHead;
  data: Map<string, Record<string, string | null>[]>;
}

/** سقف حجم فایل فشرده برای بازگردانی در حافظه */
const MAX_DUMP_BYTES = 300 * 1024 * 1024;

export async function readJsonDump(abs: string): Promise<JsonDump> {
  const size = statSync(abs).size;
  if (size > MAX_DUMP_BYTES) throw fail("فایل بکاپ خیلی بزرگ است؛ برای بازگردانی از pg_restore استفاده کنید.");
  let text = "";
  try {
    text = gunzipSync(readFileSync(abs)).toString("utf8");
  } catch {
    throw fail("فایل بکاپ خوانده نشد (خراب یا نصفه‌کاره؟).");
  }
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) throw fail("فایل بکاپ خالی است.");
  const head = JSON.parse(lines[0]) as DumpHead;
  if (head?.format !== "nobino-db-backup") throw fail("قالب فایل بکاپ شناخته‌شده نیست.");
  const data = new Map<string, Record<string, string | null>[]>();
  for (const line of lines.slice(1)) {
    let obj: { table?: string; rows?: Record<string, string | null>[] };
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.table) data.set(obj.table, obj.rows ?? []);
  }
  return { head, data };
}

/* ── بازگردانی ─────────────────────────────────────────────────────────── */

export interface RestoreOptions {
  actor?: string;
  /** false = بدون بکاپ ایمنی (فقط وقتی خودتان مطمئنید) */
  snapshotFirst?: boolean;
  onMessage?: (msg: string) => void;
}

export async function restoreBackup(name: string, opts: RestoreOptions = {}): Promise<{ snapshot?: string; engine: BackupEngine; message: string }> {
  const abs = resolveBackupPath(name);
  if (!existsSync(abs)) throw Object.assign(new Error(`فایل بکاپ «${safeFileLabel(name)}» روی دیسک نیست.`), { status: 404 });
  const engine = engineOf(name, readMeta(abs));
  assertIdle();
  const job = startJob("restore", engine, safeFileLabel(name));
  try {
    let snapshot: string | undefined;
    if (opts.snapshotFirst !== false) {
      opts.onMessage?.("بکاپ ایمنی پیش از بازگردانی…");
      // قفل در اختیار همین job است؛ هستهٔ نوشتن مستقیم صدا زده می‌شود
      const built = await writeDump({
        label: `پیش از بازگردانی ${safeFileLabel(name)}`,
        kind: "pre-restore",
        actor: opts.actor,
        // بکاپ json همیشه با موتور json نوشته می‌شود؛ برای dump هم همان‌جا که هست
        engine: engine === "pg" ? undefined : "json",
        onMessage: opts.onMessage,
      });
      snapshot = built.name;
    }
    if (engine === "pg") await restorePg(abs);
    else await restoreJson(abs, opts.onMessage ?? (() => undefined));
    finishJob(job, "done", `بازگردانی ${safeFileLabel(name)} انجام شد`);
    return {
      snapshot,
      engine,
      message:
        engine === "pg"
          ? "بازگردانی با pg_restore انجام شد. چون سرویس هم‌زمان به دیتابیس وصل است، بعد از آن سرویس را ری‌استارت کنید (pm2 restart nobino-api)."
          : "بازگردانی در یک تراکنش commit شد؛ داده از همین لحظه قابل دیدن است.",
    };
  } catch (err) {
    finishJob(job, "failed", errMessage(err));
    throw err;
  }
}

function readMeta(abs: string): Record<string, string> {
  try {
    return parseMeta(readFileSync(`${abs}.meta`, "utf8"));
  } catch {
    return {};
  }
}

function errMessage(err: unknown): string {
  return sanitize(err instanceof Error ? err.message : String(err));
}

async function restorePg(abs: string): Promise<void> {
  const target = dbTarget();
  if (!target) throw fail("DATABASE_URL نیست؛ pg_restore ممکن نیست.");
  const lt = String(process.env.BACKUP_LOCK_TIMEOUT_MS ?? "20s").trim() || "20s";
  const { code, stderr } = await run("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", `--dbname=${target}`, abs], {
    PGOPTIONS: `-c lock_timeout=${lt}`,
  });
  // مثل update.sh: هر کد غیرصفر شکست است
  if (code !== 0) {
    throw fail(
      `pg_restore با کد ${code} شکست خورد (${tail(stderr)}). دیتابیس ممکن است نیمه‌کاره باشد؛ بکاپ «پیش از بازگردانی» را از همان پنل برگردانید.`,
    );
  }
}

/** سقف پارامتر هر جمله (پروتکل PostgreSQL تا ۶۵۵۳۵ مجاز است، محافظه‌کارانه ۵۰۰۰) */
const MAX_PARAMS = 5000;

async function restoreJson(abs: string, onMessage: (msg: string) => void): Promise<void> {
  const dump = await readJsonDump(abs);
  const live = await tableNames(prisma as unknown as Sql);
  const liveSet = new Set(live);
  const goneFromSchema = dump.head.tables.filter((t) => !liveSet.has(t.name)).map((t) => t.name);

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '20s'`).catch(() => undefined);
      onMessage(`پاک‌کردن ${live.length} جدول…`);
      if (live.length) await tx.$executeRawUnsafe(`TRUNCATE TABLE ${live.map(q).join(", ")} RESTART IDENTITY CASCADE`);
      const { order, cycles } = await orderedTablesForInsert(tx);
      let done = 0;
      for (const table of order) {
        const rows = dump.data.get(table);
        if (!rows || !rows.length) continue;
        const cols = await columnsOf(tx, table);
        const insertCols = cols.filter(insertableColumn);
        const keys = Object.keys(rows[0]);
        const usable = insertCols.filter((c) => keys.includes(c.attname));
        if (!usable.length) continue;
        const perRow = usable.length;
        const rowsPerStmt = Math.max(1, Math.min(200, Math.floor(MAX_PARAMS / perRow)));
        onMessage(`درج ${table} (${rows.length.toLocaleString("en-US")} ردیف)…`);
        for (let i = 0; i < rows.length; i += rowsPerStmt) {
          const slice = rows.slice(i, i + rowsPerStmt);
          const params: (string | null)[] = [];
          for (const r of slice) for (const c of usable) params.push(r[c.attname] ?? null);
          await tx.$executeRawUnsafe(multiRowInsert(table, usable, slice.length), ...params);
        }
        await resyncSequences(tx, table, cols);
        done++;
      }
      const notes: string[] = [];
      if (goneFromSchema.length) notes.push(`${goneFromSchema.length} جدولِ بکاپ دیگر در schema نیست و رد شد (${goneFromSchema.slice(0, 5).join("، ")}).`);
      if (cycles.length) notes.push(`حلقهٔ کلید بیرونی: ${cycles.slice(0, 5).join("، ")} — درج در همان ترتیب انجام شد.`);
      if (notes.length) onMessage(notes.join(" · "));
      onMessage(`بازگردانی ${done} جدول کامل شد؛ در حال commit…`);
    },
    { timeout: 30 * 60 * 1000, maxWait: 15_000 },
  );
}

/**
 * بعد از درج کلیدهای اصلی صریح، sequence عقب می‌ماند و اولین INSERT تازه با
 * تضاد کلید می‌شکند. برای هر ستون serial/identity مقدار setval می‌گیرد.
 */
async function resyncSequences(tx: Sql, table: string, cols: ColumnRow[]): Promise<void> {
  for (const c of cols) {
    if (!/^(integer|bigint|smallint)$/i.test(c.type)) continue;
    // regclass نام را بدون نقل‌قول به حرف کوچک می‌برد؛ پس `public."Table"` لازم است
    const rows = await tx.$queryRawUnsafe<{ s: string | null }[]>(
      `SELECT pg_get_serial_sequence(to_regclass($1)::text, $2) AS s`,
      `public.${q(table)}`,
      c.attname,
    );
    const seq = rows[0]?.s;
    if (!seq) continue;
    await tx
      .$executeRawUnsafe(`SELECT setval(${q2(seq)}, (SELECT COALESCE(MAX(${q(c.attname)}), 0) + 1 FROM ${q(table)}), false)`)
      .catch(() => undefined);
  }
}

function q2(text: string): string {
  return `'${String(text).replace(/'/g, "''")}'`;
}

/* ── حذف و دانلود ──────────────────────────────────────────────────────── */

export function deleteBackup(name: string): { removed: string[] } {
  const abs = resolveBackupPath(name);
  if (!existsSync(abs)) throw Object.assign(new Error(`فایل «${safeFileLabel(name)}» وجود ندارد.`), { status: 404 });
  assertIdle();
  const removed: string[] = [];
  rmSync(abs);
  removed.push(name);
  if (existsSync(`${abs}.meta`)) {
    rmSync(`${abs}.meta`, { force: true });
    removed.push(`${name}.meta`);
  }
  return { removed };
}

export function backupFilePath(name: string): { abs: string; name: string; bytes: number } {
  const abs = resolveBackupPath(name);
  if (!existsSync(abs)) throw Object.assign(new Error(`فایل «${safeFileLabel(name)}» روی دیسک نیست.`), { status: 404 });
  return { abs, name, bytes: statSync(abs).size };
}

/* ── فرایندهای کمکی ────────────────────────────────────────────────────── */

function run(bin: string, args: string[], extraEnv: Record<string, string>): Promise<{ code: number; stderr: string }> {
  return new Promise((res) => {
    let stderr = "";
    const child = spawn(bin, args, { env: { ...process.env, ...extraEnv } });
    child.stderr?.on("data", (b) => {
      stderr = (stderr + b.toString("utf8")).slice(-8000);
    });
    child.on("error", (e) => res({ code: -1, stderr: (e as Error).message }));
    child.on("close", (code) => res({ code: code ?? -1, stderr }));
  });
}

function tail(stderr: string): string {
  const lines = sanitize(stderr).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.slice(-2).join(" · ").slice(0, 300) || "بدون پیام";
}

/* ── خلاصه‌ای که پنل برای رندر نیاز دارد (بدون هیچ راز) ───────────────── */

export async function backupStatus() {
  const engine = await activeEngine();
  const info = dbInfo();
  const dir = backupsDir();
  return {
    dir,
    dirExists: existsSync(dir),
    engine,
    enginePreference: await enginePreference(),
    pgAvailable: pgToolsAvailable(),
    keep: await keepCount(),
    db: info.db,
    host: info.host,
    port: info.port,
    maskedUrl: info.masked,
    commit: commitNow(),
    branch: branchNow(),
    busy: currentJob(),
    jobs: recentJobs(),
  };
}

/** ساخت بکاپ با قفل + چرخش (روت POST آن را در پس‌زمینه اجرا می‌کند) */
export async function createBackup(opts: WriteOptions = {}): Promise<BackupEntry> {
  // قفل پیش از هر await گرفته می‌شود (`assertIdle` و `startJob` پشت‌سرهم و
  // بدون await) تا دو درخواست هم‌زمان هر دو اجازهٔ شروع نگیرند. موتور برای
  // برچسب job حدسی است؛ انتخاب واقعی با تنظیم `backups.engine` داخل writeDump.
  const guessed = opts.engine ?? (pgToolsAvailable() ? "pg" : "json");
  assertIdle();
  const job = startJob("create", guessed, (opts.label ?? "").slice(0, 60));
  try {
    const dump = await writeDump({ ...opts, onMessage: (m) => (job.message = sanitize(m).slice(0, 400)) });
    const removed = await rotate();
    finishJob(job, "done", `بکاپ ${dump.name} ساخته شد${removed.length ? ` و ${removed.length} بکاپ کهنه حذف شد` : ""}`);
    return entryOf(dump, opts);
  } catch (err) {
    finishJob(job, "failed", errMessage(err));
    throw err;
  }
}
