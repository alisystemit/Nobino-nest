/**
 * تست‌های deploy/update.sh — مسیر بکاپ و بازگشت (rollback).
 *
 * روی سرور واقعی این اسکریپت با pg_dump/pg_restore و pm2 طرف است؛ اینجا همان
 * اسکریپت را داخل یک درخت پروژهٔ موقت و با تابع‌های stub اجرا می‌کنیم تا
 * رفتارِ واقعیِ کنترل جریان سنجیده شود (ترتیب مراحل، توقف روی شکست، چرخش
 * بکاپ، تأییدِ اقدام ویرانگر).
 *
 * دو نکتهٔ ایمنی:
 *   ۱) تابع `command` هم stub می‌شود؛ پس ابزار واقعیِ سیستم (pm2/pg_dump) هرگز
 *      صدا زده نمی‌شود و با W_MISSING می‌توان «نبودن» یک ابزار را شبیه‌سازی کرد.
 *   ۲) اسکریپت در یک subshell source می‌شود، پس `exit`های آن فقط همان subshell
 *      را می‌بندد و کد خروج قابل خواندن است.
 *
 * اگر `bash` در PATH نباشد کل دسته skip می‌شود (ویندوز بدون Git Bash).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOW_SKIP } from "./lib/test-guard.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const REAL_SCRIPT = join(REPO, "deploy", "update.sh");

/** مسیر ویندوزی → مسیر POSIX که bash می‌فهمد */
const px = (s) => String(s).replace(/\\/g, "/").replace(/^([A-Za-z]):\//, (_m, d) => `/${d.toLowerCase()}/`);

const bashOk = (() => {
  try {
    return spawnSync("bash", ["--version"], { encoding: "utf8" }).status === 0;
  } catch {
    return false;
  }
})();

const ENV_TEXT = [
  'DATABASE_URL="postgresql://nobino:secret@localhost:5433/nobino?schema=public"',
  'PORT="3977"',
  "",
].join("\n");

const OLD_DUMPS = ["aa11111", "bb22222", "cc33333"];

/** یک «سرور» موهوم: درخت پروژهٔ کوچک + کپی update.sh + بکاپ‌های optional */
function fixture({ envText = ENV_TEXT, oldDumps = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "nobino-update-"));
  const app = join(root, "app");
  for (const d of ["deploy", "scripts", "prisma/migrations", "node_modules/prisma/build", "backend", "frontend"]) {
    mkdirSync(join(app, d), { recursive: true });
  }
  writeFileSync(join(app, "package.json"), "{}\n");
  writeFileSync(join(app, "node_modules/prisma/build/index.js"), "// stub prisma cli\n");
  writeFileSync(join(app, "scripts/build-release.mjs"), "// stub build\n");
  writeFileSync(join(app, "scripts/paas-start.mjs"), "// stub paas\n");
  writeFileSync(join(app, "prisma/schema.prisma"), "// stub\n");
  if (envText) writeFileSync(join(app, ".env"), envText);
  writeFileSync(join(app, "deploy/update.sh"), readFileSync(REAL_SCRIPT));
  const backupDir = join(app, "backups");
  if (oldDumps) {
    mkdirSync(backupDir, { recursive: true });
    OLD_DUMPS.forEach((c, i) => {
      const f = join(backupDir, `nobino-${c}-2026110${i}-01000${i}.dump`);
      writeFileSync(f, "PGDMP\x03old\n");
      writeFileSync(`${f}.meta`, `commit=${c}\nbranch=main\ndb=nobino\n`);
      // mtimeهای مشخص و با فاصله: ترتیب ls -t نباید به ثانیهٔ همسان وابسته باشد
      const t = new Date(Date.now() - (OLD_DUMPS.length - i) * 3600_000);
      utimesSync(f, t, t);
      utimesSync(`${f}.meta`, t, t);
    });
  }
  return { root, app, backupDir };
}

const STUBS = `
wlog(){ printf '%s\\n' "$*" >> "$W_LOG"; }
git(){ wlog "git $*"; case "$*" in
  *"--abbrev-ref HEAD"*) printf 'main\\n' ;;
  *"--short HEAD"*) printf '%s\\n' "\${W_HEAD:-c1}" ;;
  *"status --porcelain --untracked-files=no"*) [[ "\${W_DIRTY:-}" == "1" ]] && printf ' M src/x.ts\\n' ;;
  *"status --porcelain --untracked-files=only"*) [[ "\${W_UNTRACKED:-}" == "1" ]] && printf '?? backups/x.dump\\n' ;;
  *"status --porcelain"*) [[ "\${W_DIRTY:-}" == "1" ]] && printf ' M src/x.ts\\n' ;;
  *"refs/remotes/origin/HEAD"*) [[ "\${W_DETACHED:-}" == "2" ]] && return 1; printf 'refs/remotes/origin/main\\n' ;;
  *"symbolic-ref -q HEAD"*) [[ -n "\${W_DETACHED:-}" ]] && return 1 ;;
esac; return 0; }
# «sh -c "cd … && npm ci"» — تا npm واقعی هرگز اجرا نشود
sh(){ wlog "sh $*"; return 0; }
node(){ wlog "node $*"; case "$*" in
  *"migrate deploy"*) [[ "\${W_NODE_FAIL:-}" == "migrate" ]] && return 1 ;;
  *"db push"*) [[ "\${W_NODE_FAIL:-}" == "push" ]] && return 1 ;;
esac; return 0; }
# رمز باید از محیط بیاید، نه argv؛ خط pgenv نشان می‌دهد چه چیزی واقعاً ست شده
pg_dump(){ wlog "pgenv PGPASSWORD=\${PGPASSWORD:-} PGUSER=\${PGUSER:-} PGHOST=\${PGHOST:-} PGPORT=\${PGPORT:-} PGDATABASE=\${PGDATABASE:-}"
  wlog "pg_dump $*"; local f=""; for a in "$@"; do case "$a" in --file=*) f="\${a#--file=}";; esac; done
  [[ -n "$f" ]] && printf 'PGDMP\\x03stub\\n' > "$f"; return 0; }
pg_restore(){ wlog "pgenv PGPASSWORD=\${PGPASSWORD:-} PGDATABASE=\${PGDATABASE:-}"; wlog "pg_restore $*"
  [[ "\${W_RESTORE_FAIL:-}" == "1" ]] && return 1
  return 0; }
psql(){ wlog "psql $*"; printf '%s\\n' "\${W_TABLES:-14}"; return 0; }
pm2(){ wlog "pm2 $*"; case "$*" in
  *"pid nobino-api"*) printf '%s\\n' "\${W_PM2_PID:-}" ;;
esac; return 0; }
ss(){ wlog "ss $*"; printf 'LISTEN 0 511 0.0.0.0:3977 0.0.0.0:* users:(("node",pid=%s,fd=18))\\n' "\${W_SS_PID:-}"; return 0; }
curl(){ wlog "curl $*"; [[ "\${W_CURL_FAIL:-}" == "1" ]] && return 1; printf '{"ok":true}\\n'; return 0; }
sleep(){ :; }
# command -v ربوده می‌شود: W_MISSING وجود ابزار را لغو می‌کند و مسیرِ واقعیِ
# سیستم (مثلاً pm2 نصب‌شده روی این ماشین) هرگز بررسی/اجرا نمی‌شود.
command(){ if [[ "\${1:-}" == "-v" ]]; then local n="\${2:-}";
    case " \${W_MISSING:-} " in *" $n "*) return 1 ;; esac; fi
  builtin command "$@"; }
`;

/** اجرای update.sh با stubها → { out, rc, log, box } */
function runUpdate(args = [], { env = {}, box } = {}) {
  const b = box || fixture();
  const stubPath = join(b.root, "stubs.sh");
  const wrapperPath = join(b.root, "wrapper.sh");
  const logPath = join(b.root, "exec.log");
  writeFileSync(stubPath, STUBS);
  writeFileSync(
    wrapperPath,
    [
      `W_LOG=${JSON.stringify(px(logPath))}`,
      `source ${JSON.stringify(px(stubPath))}`,
      `( source ${JSON.stringify(px(join(b.app, "deploy/update.sh")))} "$@" )`,
      `printf 'WRAPPER_RC=%s\\n' "$?"`,
      "",
    ].join("\n")
  );
  // DATABASE_URL شل بیرون نشت نکند: هر تست یا خودش می‌دهد یا باید نبودنش را بسنجد
  const childEnv = { ...process.env, W_LOG: px(logPath), ...env };
  if (env.DATABASE_URL === undefined) delete childEnv.DATABASE_URL;
  const res = spawnSync("bash", [px(wrapperPath), ...args], {
    encoding: "utf8",
    env: childEnv,
  });
  // رنگ‌های ANSI را می‌چینیم تا منطبق‌های regex ساده بمانند
  const out = `${res.stdout || ""}${res.stderr || ""}`.replace(/\x1B\[[0-9;]*m/g, "");
  const rc = Number((out.match(/WRAPPER_RC=(-?\d+)/) || [])[1] ?? -1);
  const log = existsSync(logPath) ? readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { out, rc, log, box: b };
}

const readScript = () => readFileSync(REAL_SCRIPT, "utf8").replace(/\r\n/g, "\n");

const at = (log, needle) => log.findIndex((l) => l.includes(needle));
const count = (log, prefix) => log.filter((l) => l.startsWith(prefix)).length;
const dumpsIn = (dir) => (existsSync(dir) ? readdirSync(dir) : []).filter((f) => f.endsWith(".dump")).sort();

// ME-9: نبودِ bash یعنی کل دستهٔ بالا skip و `npm test` سبز — این تست همان را
// بی‌صدا رد نمی‌کند (مگر با SKIP_MISSING_ARTIFACTS=1).
test("پیش‌نیاز: bash برای تست‌های deploy/update.sh در PATH است", (t) => {
  if (bashOk) return;
  if (ALLOW_SKIP) {
    t.skip("bash نیست ولی SKIP_MISSING_ARTIFACTS=1");
    return;
  }
  t.fail("bash در PATH نیست → هیچ‌کدام از تست‌های update.sh اجرا نشد؛ Git Bash را نصب/در PATH بگذارید یا SKIP_MISSING_ARTIFACTS=1");
});

describe("deploy/update.sh — بکاپ و بازگشت", { skip: bashOk ? false : "bash در دسترس نیست" }, () => {  test("فایل با bash -n سالم است", () => {
    const r = spawnSync("bash", ["-n", px(REAL_SCRIPT)], { encoding: "utf8" });
    assert.equal(r.status, 0, `bash -n: ${r.stderr}`);
  });

  test("هر گزینهٔ پارسر در --help مستند شده است", () => {
    const src = readScript();
    const block = src.match(/case "\$1" in([\s\S]*?)\n\s*esac/);
    assert.ok(block, "بلوک پارس گزینه‌ها پیدا نشد");
    const flags = [...new Set([...block[1].matchAll(/^\s+(-{1,2}[a-z-]+)/gm)].map((m) => m[1]))].filter(
      (f) => f !== "-h" && f !== "--help"
    );
    assert.ok(flags.length >= 7, `تعداد گزینه‌ها کم است: ${flags.join(", ")}`);
    const help = spawnSync("bash", [px(REAL_SCRIPT), "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0);
    const helpText = `${help.stdout || ""}`.replace(/\x1B\[[0-9;]*m/g, "");
    for (const f of flags) assert.ok(helpText.includes(f), `--help گزینهٔ ${f} را نشان نمی‌دهد`);
    assert.ok(!helpText.includes("die "), "راهنما نباید کد اسکریپت را چاپ کند");
  });

  test("گزینهٔ ناشناخته و مقدار جاافتاده رد می‌شوند؛ هیچ دستوری اجرا نمی‌شود", () => {
    const a = runUpdate(["--frobnicate"]);
    assert.equal(a.rc, 1);
    assert.match(a.out, /Unknown option/);
    assert.deepEqual(a.log, []);
    const b = runUpdate(["--keep"]);
    assert.equal(b.rc, 1);
    assert.match(b.out, /--keep/);
    assert.deepEqual(b.log, []);
    const c = runUpdate(["--keep", "abc"]);
    assert.equal(c.rc, 1);
    assert.match(c.out, /--keep/);
  });

  test("--dry-run: بکاپ را نشان می‌دهد و هیچ چیزی اجرا/ساخته نمی‌شود", () => {
    const { rc, out, log, box } = runUpdate(["--dry-run"]);
    assert.equal(rc, 0, out);
    const line = out.split(/\r?\n/).find((l) => l.includes("--dbname="));
    assert.ok(line, "خط pg_dump در dry-run چاپ نشد");
    // HI-1: نشانی به pg_dump دیگر رمز ندارد؛ اعتبارنامه از محیط می‌آید
    assert.match(line, /--dbname=nobino$/);
    assert.ok(!line.includes("@"), "نشانی argv نباید میزبان/رمز داشته باشد");
    assert.ok(!line.includes("?schema="), "پرس‌وجوی Prisma نباید به libpq برود");
    assert.match(line, /--file=\S*\/backups\/nobino-c1-\d{8}-\d{6}\.dump(?= )/);
    // dry-run فقط خواندنی است: git rev-parse برای گزارش مجاز است، هیچ دستور
    // تغییردهنده‌ای (npm ci / node / pg_dump / pm2 / curl) نباید اجرا شود
    assert.deepEqual(log.filter((l) => !l.startsWith("git ")), [], "در dry-run چیزی اجرا شد");
    assert.equal(existsSync(box.backupDir), false, "dry-run نباید پوشهٔ بکاپ بسازد");
  });

  test("هیچ رمز دیتابیزی به argv یا stdout نمی‌رسد؛ فقط PGPASSWORD", () => {
    // HI-1: قبلاً در اجرای واقعی نشانی کامل (با رمز) روی خط فرمان می‌رفت و در
    // `ps auxe` خوانده می‌شد. حالا argv فقط نام دیتابیس است و رمز در محیط می‌ماند.
    const plain = runUpdate(["--dry-run"]);
    assert.equal(plain.rc, 0, plain.out);
    assert.ok(!plain.out.includes("secret"), "رمز در خروجی dry-run لو رفت");
    assert.match(plain.out, /--dbname=nobino/);
    const rb = runUpdate(["--rollback", "--yes", "--dry-run"], { box: fixture({ oldDumps: true }) });
    assert.equal(rb.rc, 0, rb.out);
    assert.ok(!rb.out.includes("secret"), "رمز در خروجی dry-runِ rollback لو رفت");
    assert.match(rb.out, /postgresql:\/\/nobino:\*\*\*@localhost:5433\/nobino/, "نمایش ماسک‌شدهٔ نشانی");
    const real = runUpdate(["--no-pull"]);
    assert.equal(real.rc, 0, real.out);
    const dumpLine = real.log.find((l) => l.startsWith("pg_dump"));
    assert.ok(dumpLine && dumpLine.includes("--dbname=nobino"), `pg_argv: ${dumpLine}`);
    assert.ok(!real.log.some((l) => l.startsWith("pg_dump") && l.includes("secret")), "رمز در argv pg_dump");
    assert.ok(real.log.some((l) => l.startsWith("pgenv") && l.includes("PGPASSWORD=secret")), "رمز به PGPASSWORD نرفت");
    assert.ok(!real.out.includes("secret"), "رمز در stdout اجرای واقعی لو رفت");
    // رمزی که خودش «@» دارد: تجزیه باید تا آخرین «@» برود، نه اولینش
    const atSign = runUpdate([], {
      box: fixture({ envText: 'DATABASE_URL="postgresql://ad@min:hunt3r2@db:5433/nobino?schema=public"\nPORT="3977"\n' }),
    });
    assert.equal(atSign.rc, 0, atSign.out);
    assert.ok(!atSign.log.some((l) => l.startsWith("pg_dump") && l.includes("hunt3r2")), "رمز در argv");
    assert.ok(atSign.log.some((l) => l.startsWith("pgenv") && l.includes("PGPASSWORD=hunt3r2") && l.includes("PGUSER=ad@min")),
      `تجزیهٔ نشانی با @ در نام‌کاربری: ${atSign.log.find((l) => l.startsWith("pgenv"))}`);
    assert.ok(!atSign.out.includes("hunt3r2"), "بخشی از رمز در خروجی لو رفت");
    // رمز URL-encode شده (%40) باید قبل از export بازکدگشایی شود
    const enc = runUpdate([], {
      box: fixture({ envText: 'DATABASE_URL="postgresql://nobo:pa%40ss@localhost:5433/nobino"\nPORT="3977"\n' }),
    });
    assert.equal(enc.rc, 0, enc.out);
    assert.ok(enc.log.some((l) => l.startsWith("pgenv") && l.includes("PGPASSWORD=pa@ss")),
      `decode نشد: ${enc.log.find((l) => l.startsWith("pgenv"))}`);
  });

  test("جریان عادی: بکاپ پیش از migrate و پیش از restart؛ dump و .meta روی دیسک", () => {
    const { rc, out, log, box } = runUpdate([]);
    assert.equal(rc, 0, out);
    const iDump = at(log, "pg_dump");
    const iMig = at(log, "migrate deploy");
    const iRestart = at(log, "pm2 restart");
    assert.ok(iDump >= 0 && iMig >= 0 && iRestart >= 0, `لاگ ناقص: ${log.join(" | ")}`);
    assert.ok(iDump < iMig, "بکاپ باید قبل از تغییر schema باشد");
    assert.ok(iMig < iRestart, "migrate باید قبل از restart باشد");
    const dumps = dumpsIn(box.backupDir);
    assert.equal(dumps.length, 1, `فقط یک بکاپ: ${dumps.join(", ")}`);
    assert.match(dumps[0], /^nobino-c1-\d{8}-\d{6}\.dump$/);
    assert.ok(existsSync(join(box.backupDir, dumps[0])), "خودِ فایل dump ساخته شد");
    const meta = readFileSync(join(box.backupDir, `${dumps[0]}.meta`), "utf8");
    assert.match(meta, /commit=c1/);
    assert.match(meta, /db=nobino/);
    assert.match(out, /Update finished/);
    assert.ok(at(log, "curl") > iRestart, "بررسی سلامت بعد از restart");
    assert.ok(log.some((l) => l.includes("curl") && l.includes("127.0.0.1:3977")), "PORT از .env خوانده شد");
  });

  test("--backup-dir مسیر بکاپ را عوض می‌کند و پوشهٔ پیش‌فرض ساخته نمی‌شود", () => {
    const box = fixture();
    const alt = join(box.root, "elsewhere");
    const { rc, log } = runUpdate(["--backup-dir", px(alt)], { box });
    assert.equal(rc, 0);
    assert.equal(dumpsIn(alt).length, 1, "بکاپ در مسیر تازه نیست");
    assert.equal(existsSync(box.backupDir), false, "مسیر پیش‌فرض ساخته شد با وجود --backup-dir");
    assert.ok(log.some((l) => l.startsWith("pg_dump") && l.includes("elsewhere")));
  });

  test("چرخش: فقط KEEP بکاپِ تازه می‌ماند (dump و .meta با هم)", () => {
    const box = fixture({ oldDumps: true });
    assert.equal(dumpsIn(box.backupDir).length, 3);
    const { rc, out } = runUpdate(["--keep", "2"], { box });
    assert.equal(rc, 0, out);
    const left = dumpsIn(box.backupDir);
    assert.equal(left.length, 2, `باید 2 بکاپ بماند: ${left.join(", ")}`);
    assert.ok(left.some((f) => f.startsWith("nobino-c1-")), "بکاپ همین اجرا باید بماند");
    assert.ok(left.some((f) => f.startsWith("nobino-cc33333-")), "تازه‌ترین بکاپ قبلی باید بماند");
    assert.ok(!left.some((f) => f.startsWith("nobino-aa11111-")), "کهنه‌ترین باید حذف می‌شد");
    assert.match(out, /Old backup removed/);
    for (const f of left) assert.ok(existsSync(join(box.backupDir, `${f}.meta`)), `.meta کنار ${f} حذف نشد`);
    assert.equal(existsSync(join(box.backupDir, "nobino-aa11111-20261100-010000.dump.meta")), false);
  });

  test("--no-backup: هشدار می‌دهد، pg_dump اجرا نمی‌کند و ارتقا ادامه می‌یابد", () => {
    const { rc, out, log, box } = runUpdate(["--no-backup"]);
    assert.equal(rc, 0, out);
    assert.equal(count(log, "pg_dump"), 0);
    assert.match(out, /Backup skipped/);
    assert.equal(existsSync(box.backupDir), false);
    assert.ok(at(log, "pm2 restart") >= 0);
  });

  test("DATABASE_URL نبود: می‌ایستد، بکاپ نمی‌گیرد و ری‌استارت نمی‌کند", () => {
    const { rc, out, log, box } = runUpdate([], { box: fixture({ envText: 'PORT="3977"\n' }) });
    assert.equal(rc, 1, out);
    assert.match(out, /DATABASE_URL/);
    assert.equal(count(log, "pg_dump"), 0);
    assert.equal(at(log, "pm2 restart"), -1, "بدون بکاپ نباید ری‌استارت شد");
    assert.equal(existsSync(box.backupDir), false);
  });

  test("pg_dump روی سرور نبود: می‌ایستد و راه‌حل را می‌گوید", () => {
    const { rc, out, log } = runUpdate([], { env: { W_MISSING: "pg_dump" } });
    assert.equal(rc, 1, out);
    assert.match(out, /pg_dump is not in PATH/);
    assert.match(out, /--no-backup/);
    assert.equal(at(log, "migrate deploy"), -1, "قبل از تغییر schema می‌ایستد");
  });

  test("شکست migrate: ری‌استارت نمی‌کند و همان بکاپ + --rollback را نشان می‌دهد", () => {
    const { rc, out, log } = runUpdate([], { env: { W_NODE_FAIL: "migrate" } });
    assert.equal(rc, 1, out);
    assert.match(out, /schema was not aligned; the service was not restarted/);
    assert.match(out, /--rollback --yes/);
    assert.match(out, /nobino-c1-\d{8}-\d{6}\.dump/);
    assert.equal(at(log, "pm2 restart"), -1, "با schema ناسازگار سرویس تازه بالا نمی‌آید");
  });

  test("--rollback بدون --yes در اجرای غیرتعاملی: هیچ چیزی خراب نمی‌شود", () => {
    const box = fixture({ oldDumps: true });
    const { rc, out, log } = runUpdate(["--rollback"], { box });
    assert.equal(rc, 1, out);
    assert.match(out, /--yes/);
    assert.equal(count(log, "pg_restore"), 0);
    assert.equal(log.filter((l) => l.includes("checkout")).length, 0, "checkout هم نباید بشود");
    assert.equal(count(log, "pm2 stop"), 0);
  });

  test("--rollback --yes: توقف سرویس → restore → checkout → بازسازی همان نسخه", () => {
    const box = fixture({ oldDumps: true });
    const { rc, out, log } = runUpdate(["--rollback", "--yes"], { box });
    assert.equal(rc, 0, out);
    const iStop = at(log, "pm2 stop");
    const iRestore = at(log, "pg_restore");
    const iCheckout = log.findIndex((l) => /checkout cc33333/.test(l));
    const iMig = at(log, "migrate deploy");
    const iRestart = at(log, "pm2 restart");
    assert.ok(iStop >= 0 && iStop < iRestore, "قبل از restore سرویس متوقف می‌شود");
    assert.ok(iRestore >= 0, "pg_restore اجرا نشد");
    assert.match(log[iRestore], /--clean --if-exists/);
    // CR-2: بدون این دو فلگ، pg_restore با کد ۰ خارج می‌شد در حالی که نصف
    // جدول‌ها خالی مانده بود و اسکریپت «بازگشت موفق» می‌گفت.
    assert.match(log[iRestore], /--exit-on-error/);
    assert.match(log[iRestore], /--single-transaction/);
    assert.match(log[iRestore], /--dbname=nobino /, "رمز نباید در argv باشد");
    assert.ok(!log[iRestore].includes("?schema="), "پرس‌وجوی Prisma به pg_restore نمی‌رود");
    assert.ok(log.some((l) => l.startsWith("pgenv") && l.includes("PGPASSWORD=secret")), "pg_restore رمز را در محیط گرفت");
    assert.ok(log.some((l) => l.startsWith("psql")), "بعد از restore وضعیت دیتابیس شمرده شد");
    assert.ok(iCheckout > iRestore, "کد بعد از بازگردانی دیتابیس به کامیت بکاپ می‌رود");
    assert.ok(iMig > iCheckout, "بیلد/migrate بعد از checkout همان نسخهٔ قدیمی می‌رود");
    assert.ok(iRestart > iMig);
    assert.equal(count(log, "pg_dump"), 0, "در مسیر rollback از وضعیت خراب بکاپ نمی‌گیریم");
    assert.ok(!log.some((l) => l.includes("pull")), "rollback نباید pull کند");
    assert.match(out, /Update finished/);
    assert.match(out, /went back to before the last upgrade/);
  });

  test("--rollback روی working tree کثیف می‌ایستد (کارِ کسی نمی‌سوزد)", () => {
    const box = fixture({ oldDumps: true });
    const { rc, out, log } = runUpdate(["--rollback", "--yes"], { box, env: { W_DIRTY: "1" } });
    assert.equal(rc, 1, out);
    assert.match(out, /Working tree is dirty/);
    assert.equal(count(log, "pg_restore"), 0);
    assert.equal(count(log, "pm2 stop"), 0);
  });

  test("--rollback=<فایل دستی>: فقط دیتابیس، checkout کور نمی‌کند", () => {
    const box = fixture();
    mkdirSync(box.backupDir, { recursive: true });
    const manual = join(box.backupDir, "manual-dec1.dump");
    writeFileSync(manual, "PGDMP\x03x\n");
    const { rc, out, log } = runUpdate([`--rollback=${px(manual)}`, "--yes"], { box });
    assert.equal(rc, 0, out);
    assert.ok(at(log, "pg_restore") >= 0);
    assert.ok(out.includes("manual-dec1.dump"), "بکاپِ خواسته‌شده معرفی شد");
    assert.equal(log.filter((l) => l.includes("checkout")).length, 0, "بدون کامیتِ شناخته‌شده checkout نمی‌کنیم");
    assert.match(out, /code back to the previous version manually/);
  });

  test("dry-run سخت‌گیریِ اجرا را ندارد: نقشه را تا آخر چاپ می‌کند", () => {
    // نبودِ pg_dump و نبودِ DATABASE_URL در اجرای واقعی متوقف می‌کند، ولی
    // --dry-run فقط نقشهٔ راه را نشان می‌دهد (با نشانی جای‌گزین).
    const a = runUpdate(["--dry-run"], { env: { W_MISSING: "pg_dump" } });
    assert.equal(a.rc, 0, a.out);
    assert.match(a.out, /pg_dump is not in PATH/);
    assert.ok(a.out.split(/\r?\n/).some((l) => l.includes("[dry]") && l.includes("--dbname=nobino")));
    assert.match(a.out, /\[dry\] curl http:\/\/127\.0\.0\.1:3977\/api\/health\?db=1/);
    const b = runUpdate(["--dry-run"], { box: fixture({ envText: 'PORT="3977"\n' }) });
    assert.equal(b.rc, 0, b.out);
    assert.match(b.out, /DATABASE_URL is missing/);
    assert.ok(b.out.includes("--dbname=postgresql://USER:PASS@HOST:5432/nobino"), "نشانی جای‌گزین چاپ شد");
    assert.equal(b.log.filter((l) => l.startsWith("pg_dump")).length, 0);
  });

  test("dry-run rollback: برنامه را نشان می‌دهد بدون اجرا", () => {
    const box = fixture({ oldDumps: true });
    const { rc, out, log } = runUpdate(["--rollback", "--yes", "--dry-run"], { box, env: { W_MISSING: "pg_restore" } });
    assert.equal(rc, 0, out);
    assert.match(out, /pg_restore is missing/);
    assert.ok(out.split(/\r?\n/).some((l) => l.includes("[dry] pg_restore") && l.includes("--clean --if-exists")));
    assert.ok(out.includes("nobino-cc33333-20261102-010002.dump"), "بکاپ درست انتخاب شد");
    assert.equal(count(log, "pg_restore"), 0, "در dry-run چیزی اجرا نمی‌شود");
  });

  test("CR-2: شکست pg_restore = توقف پیش از checkout و پیش از build", () => {
    const box = fixture({ oldDumps: true });
    const { rc, out, log } = runUpdate(["--rollback", "--yes"], { box, env: { W_RESTORE_FAIL: "1" } });
    assert.equal(rc, 1, out);
    assert.match(out, /pg_restore failed/);
    assert.match(out, /--single-transaction/);
    assert.equal(log.filter((l) => l.includes("checkout")).length, 0, "با بازگردانی ناقص کد جابه‌جا نمی‌شود");
    assert.equal(at(log, "migrate deploy"), -1, "سرویس بازسازی/بالا نمی‌آید");
    assert.equal(at(log, "pm2 restart"), -1, "روی دیتابیس نیمه‌کاره ری‌استارت نمی‌کنیم");
  });

  test("CR-2: بازگردانی که هیچ جدولی نساخت، سرویس را بالا نمی‌آورد", () => {
    const box = fixture({ oldDumps: true });
    const { rc, out, log } = runUpdate(["--rollback", "--yes"], { box, env: { W_TABLES: "0" } });
    assert.equal(rc, 1, out);
    assert.match(out, /created no tables/);
    assert.equal(at(log, "migrate deploy"), -1);
  });

  test("HI-2: rollback شاخهٔ قبل را ذخیره می‌کند و اجرای بعدی از HEAD معلق بیرون می‌آید", () => {
    const box = fixture({ oldDumps: true });
    mkdirSync(join(box.app, ".git"), { recursive: true });
    const rb = runUpdate(["--rollback", "--yes"], { box });
    assert.equal(rb.rc, 0, rb.out);
    const saved = readFileSync(join(box.app, ".git", "nobino-deploy-branch"), "utf8").trim();
    assert.equal(saved, "main", "شاخهٔ قبل از rollback ذخیره نشد");
    // اجرای بعدی روی HEAD معلق (بعد از همان rollback) نباید با «not on a branch» بمیرد
    const next = runUpdate([], { box, env: { W_DETACHED: "1", W_HEAD: "cc33333" } });
    assert.equal(next.rc, 0, next.out);
    assert.match(next.out, /HEAD is detached/);
    assert.ok(next.log.some((l) => /git -C .* checkout main$/.test(l)), `بازگشت به شاخه انجام شد: ${next.log.join(" | ")}`);
    assert.ok(next.log.some((l) => l.includes("pull --ff-only")), "بعد از اتصال مجدد، pull طبیعی ادامه می‌یابد");
  });

  test("HI-2: HEAD معلق بدون شاخهٔ ذخیره‌شده با پیام راه‌حل می‌ایستد", () => {
    const box = fixture();
    mkdirSync(join(box.app, ".git"), { recursive: true });
    // نه فایل ذخیره، و stubِ origin/HEAD هم با W_DETACHED تنها برای HEAD شکست می‌خورد
    const { rc, out, log } = runUpdate([], { box, env: { W_DETACHED: "2" } });
    assert.equal(rc, 1, out);
    assert.match(out, /git checkout <branch>/);
    assert.equal(count(log, "pg_dump"), 0, "پیش از هر کاری می‌ایستد");
  });

  test("HI-3: سلامت تأیید نشود → خروج ۱، نه هشدار", () => {
    const { rc, out, log } = runUpdate(["--no-pull"], { env: { W_CURL_FAIL: "1" } });
    assert.equal(rc, 1, out);
    assert.match(out, /the deployment failed/);
    assert.ok(!out.includes("Update finished"), "success message is not printed");
    assert.ok(at(log, "curl") >= 0);
    assert.ok(count(log, "curl") > 1, "باید چند بار تلاش شده باشد");
  });

  test("HI-3: سلامتی که از پروسهٔ دیگری روی همان پورت می‌آید، پذیرفته نمی‌شود", () => {
    const { rc, out, log } = runUpdate(["--no-pull"], { env: { W_PM2_PID: "4242", W_SS_PID: "9999" } });
    assert.equal(rc, 1, out);
    assert.match(out, /process 9999/);
    assert.ok(log.some((l) => l.startsWith("ss ")), "صاحب پورت بررسی شد");
    const good = runUpdate(["--no-pull"], { env: { W_PM2_PID: "4242", W_SS_PID: "4242" } });
    assert.equal(good.rc, 0, good.out);
    assert.match(good.out, /Server is healthy \(pid 4242/);
  });

  test("LO-4: فقط فایل‌های گیت‌شدهٔ کثیف جلوی rollback را می‌گیرند", () => {
    const box = fixture({ oldDumps: true });
    const dirty = runUpdate(["--rollback", "--yes"], { box, env: { W_DIRTY: "1" } });
    assert.equal(dirty.rc, 1, dirty.out);
    assert.match(dirty.out, /Working tree is dirty/);
    // untracked (مثلاً پوشهٔ بکاپ داخل مخزن) نباید مسیر بازگشت را قفل کند
    const untrackedOnly = runUpdate(["--rollback", "--yes"], { box, env: { W_UNTRACKED: "1" } });
    assert.equal(untrackedOnly.rc, 0, untrackedOnly.out);
    assert.match(untrackedOnly.out, /untracked/);
    assert.ok(at(untrackedOnly.log, "pg_restore") >= 0, "با untracked فایل بازگشت انجام می‌شود");
  });
});
