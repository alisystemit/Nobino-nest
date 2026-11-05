// تست‌های سیستم پشتیبان‌گیری دیتابیس (سوپرادمین)
//  • بخش اول: منطق خالصِ backend/dist/lib/db-backup.js — الگوی نام، ماسک رمز،
//    متادیتا، ترتیب درج جدول‌ها و خواندن پوشه (نیازمند فقط بیلد بک‌اند).
//  • بخش دوم: پیمان API — مسیرهای manifest، هندلرها و نگهبان‌های امنیت.
// اجرا: npm test
// برای بیلد: npm run build:backend
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..");
const DIST_MAIN = join(ROOT, "backend", "dist", "main.js");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

const distReady = require("node:fs").existsSync(DIST_MAIN);
const skipIfNoBuild = (t) => {
  if (!distReady) t.skip("backend/dist وجود ندارد — با «npm run build:backend» ساخته می‌شود");
  return !distReady;
};
const B = () => require(join(ROOT, "backend", "dist", "lib", "db-backup.js"));

/* نشانی جعلی برای تست ماسک — هیچ رازی از محیط واقعی خوانده نمی‌شود */
const FAKE_URL = "postgresql://nobino:S3cr3tPass@db.internal:5433/nobino_dev?sslmode=disable";

/* ── الگوی نام فایل ────────────────────────────────────────────────────── */
describe("الگوی نام بکاپ", () => {
  test("نام‌های درستِ هر دو موتور را می‌پذیرد", (t) => {
    if (skipIfNoBuild(t)) return;
    const re = B().BACKUP_NAME_RE;
    for (const ok of [
      "nobino-a1b2c3d-20261105-131415.dump",
      "nobino-a1b2c3d-20261105-131415.json.gz",
      "nobino-release_1.2-20260101-000000.dump",
    ]) {
      assert.equal(re.test(ok), true, `باید بپذیرد: ${ok}`);
    }
  });

  test("هر نام دیگری را رد می‌کند (فرار از پوشه، پسوند دلخواه، قالب اشتباه)", (t) => {
    if (skipIfNoBuild(t)) return;
    const re = B().BACKUP_NAME_RE;
    for (const bad of [
      "../../etc/passwd",
      "..%2Fnobino-a-20261105-131415.dump",
      "nobino-a1b2c3d-20261105-131415.sql",
      "backup.dump",
      "nobino--20261105-131415.dump",
      "nobino-a1b2c3d-20261105-1314.dump",
      "nobino-a b-20261105-131415.dump",
      "Nobino-a1b2c3d-20261105-131415.dump",
      "nobino-a1b2c3d-20261105-131415.dump.sh",
      "",
    ]) {
      assert.equal(re.test(bad), false, `باید رد کند: ${bad || "(خالی)"}`);
    }
  });

  test("resolveBackupPath فقط درون پوشهٔ بکاپ می‌دهد", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    const dir = mkdtempSync(join(tmpdir(), "nobino-bk-"));
    try {
      const abs = M.resolveBackupPath("nobino-abc-20261105-131415.dump", dir);
      assert.ok(abs.startsWith(dir), "مسیر باید درون پوشه بماند");
      for (const bad of ["../x.dump", "/etc/passwd", "nobino-abc-20261105-131415.dump.evil"]) {
        assert.throws(() => M.resolveBackupPath(bad, dir), /معتبر نیست/, `رد شود: ${bad}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("safeFileLabel مسیر مطلق را به نام خالص تبدیل می‌کند", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    assert.equal(M.safeFileLabel("C:\\secrets\\deep\\path\\nobino-a-20261105-131415.dump"), "nobino-a-20261105-131415.dump");
    assert.equal(M.safeFileLabel("/var/lib/nobino/x.json.gz"), "x.json.gz");
    assert.equal(M.safeFileLabel(""), "");
  });
});

/* ── رمز و نشانی دیتابیس ───────────────────────────────────────────────── */
describe("ماسک کردن نشانی دیتابیس", () => {
  test("maskDbUrl بخش رمز را ستاره می‌کند و بقیه را نگه می‌دارد", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    assert.equal(M.maskDbUrl(FAKE_URL), "postgresql://nobino:***@db.internal:5433/nobino_dev?sslmode=disable");
    assert.equal(M.maskDbUrl("postgresql://nobino@localhost/db"), "postgresql://nobino@localhost/db", "بدون رمز چیزی عوض نشود");
    assert.equal(M.maskDbUrl(""), "");
  });

  test("sanitize رمز را از دل پیام خطا هم پاک می‌کند", (t) => {
    if (skipIfNoBuild(t)) return;
    const prev = process.env.DATABASE_URL;
    process.env.DATABASE_URL = FAKE_URL;
    try {
      const M = B();
      const leaky = `pg_dump failed while connecting to ${M.dbTarget()} with password S3cr3tPass`;
      const out = M.sanitize(leaky);
      assert.ok(!out.includes("S3cr3tPass"), "رمز نباید در خروجی باشد");
      assert.ok(!out.includes("S3cr3tPass@"), "هیچ نشانی با رمز نباید بماند");
      assert.ok(out.includes("***"), "جای ستاره‌ها گذاشته شود");
      assert.equal(M.dbInfo().db, "nobino_dev");
      assert.equal(M.dbInfo().host, "db.internal");
      assert.equal(M.dbInfo().port, "5433");
      assert.ok(!String(M.dbInfo().masked).includes("S3cr3tPass"));
    } finally {
      if (prev === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev;
    }
  });
});

/* ── متادیتا و برچسب زمانی ─────────────────────────────────────────────── */
describe("متادیتا (هم‌قالب deploy/update.sh)", () => {
  test("serializeMeta و parseMeta رفت‌وبرگشت می‌کنند", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    const text = M.serializeMeta({ engine: "json", commit: "a1b2c3d", label: "بکاپ پیش از نمایش", bytes: 2048, rows: 0, empty: undefined });
    assert.ok(text.includes("label=بکاپ پیش از نمایش"), "متن فارسی بدون تغییر بماند");
    assert.ok(!text.includes("empty="), "مقدار undefined نباید نوشته شود");
    const back = M.parseMeta(text);
    assert.equal(back.engine, "json");
    assert.equal(back.bytes, "2048");
    assert.equal(back.rows, "0", "صفر باید بماند");
    assert.equal(back.label, "بکاپ پیش از نمایش");
  });

  test("سطر شکسته یا بدون «=» ignored می‌شود و کلیدهای تکراری آخری را می‌گیرند", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    const p = M.parseMeta("بدون علامت\nengine=pg\nengine=json\n=?\n");
    assert.equal(p.engine, "json");
    assert.equal(Object.keys(p).length, 1);
  });

  test("stamp قالب UTCِ update.sh را می‌سازد", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    assert.equal(M.stamp(new Date("2026-11-05T13:14:15Z")), "20261105-131415");
    assert.match(M.stamp(), /^\d{8}-\d{6}$/);
  });

  test("q() نام‌های نقلی جدول را در PostgreSQL امن می‌کند", (t) => {
    if (skipIfNoBuild(t)) return;
    assert.equal(B().q('or"der'), '"or""der"');
  });
});

/* ── ترتیب درج جدول‌ها (موتور json) ────────────────────────────────────── */
describe("ترتیب درج بر پایهٔ کلید خارجی", () => {
  /** tx جعلی: کوئری جدول‌ها و کلیدهای خارجی را از دادهٔ تست می‌دهد */
  const fakeTx = (tables, fks) => ({
    async $queryRawUnsafe(sql) {
      if (/pg_tables/.test(sql)) return tables.map((tablename) => ({ tablename }));
      if (/pg_constraint/.test(sql)) return fks;
      throw new Error("کوئری ناشناخته در تست: " + sql);
    },
    async $executeRawUnsafe() {
      return 0;
    },
  });

  test("والد پیش از فرزند درج می‌شود", async (t) => {
    if (skipIfNoBuild(t)) return;
    const { order, cycles } = await B().orderedTablesForInsert(
      fakeTx(
        ["Appointment", "Salon", "Staff", "User"],
        [
          { child: "Salon", parent: "User" },
          { child: "Staff", parent: "Salon" },
          { child: "Appointment", parent: "Staff" },
          { child: "Appointment", parent: "Salon" },
        ],
      ),
    );
    assert.deepEqual(cycles, [], "گرافی که دور ندارد نباید گزارش شود");
    assert.equal(order.length, 4);
    for (const fk of [
      ["Salon", "User"],
      ["Staff", "Salon"],
      ["Appointment", "Staff"],
      ["Appointment", "Salon"],
    ]) {
      assert.ok(order.indexOf(fk[0]) > order.indexOf(fk[1]), `${fk[0]} بعد از ${fk[1]} درج شود`);
    }
  });

  test("دورِ کلید خارجی بی‌پایان نمی‌ماند و گزارش می‌شود", async (t) => {
    if (skipIfNoBuild(t)) return;
    const { order, cycles } = await B().orderedTablesForInsert(
      fakeTx(["A", "B", "C"], [
        { child: "A", parent: "B" },
        { child: "B", parent: "A" },
        { child: "C", parent: "C" },
      ]),
    );
    assert.equal(order.length, 3, "جدول سالمِ بیرونِ دور (C) هم در ترتیب می‌ماند");
    assert.ok(order.indexOf("C") === 0, "C که وابستگی واقعی ندارد اول درج می‌شود");
    assert.deepEqual(cycles.sort(), ["A", "B"], "فقط دور واقعی گزارش شود (A→A نادیده)");
  });

  test("کلید خارجی به جدولِ خارج از public نادیده می‌شود", async (t) => {
    if (skipIfNoBuild(t)) return;
    const { order, cycles } = await B().orderedTablesForInsert(
      fakeTx(["Solo"], [{ child: "Solo", parent: "pg_catalog" }]),
    );
    assert.deepEqual(order, ["Solo"]);
    assert.deepEqual(cycles, []);
  });
});

/* ── فهرست پوشهٔ بکاپ ──────────────────────────────────────────────────── */
describe("فهرست بکاپ‌ها از روی دیسک", () => {
  test("فایل‌های معتبر با متادیتا خوانده و تازه‌ترین اول می‌آید", async (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    const dir = mkdtempSync(join(tmpdir(), "nobino-list-"));
    const prevOverride = globalThis.__NOBINO_BACKUP_DIR__;
    const prevUrl = process.env.DATABASE_URL;
    try {
      globalThis.__NOBINO_BACKUP_DIR__ = dir;
      delete process.env.DATABASE_URL;
      writeFileSync(join(dir, "nobino-aaaaaaa-20261101-101010.json.gz"), "x");
      writeFileSync(join(dir, "nobino-aaaaaaa-20261101-101010.json.gz.meta"), M.serializeMeta({ engine: "json", kind: "pre-restore", commit: "aaaaaaa", branch: "main", db: "nobino_test", tables: 40, rows: 900, label: "پیش از بازگردانی", actor: "admin" }));
      writeFileSync(join(dir, "nobino-bbbbbbb-20261105-101010.dump"), "y".repeat(2048));
      writeFileSync(join(dir, "nobino-bbbbbbb-20261105-101010.dump.meta"), M.serializeMeta({ engine: "pg", commit: "bbbbbbb", branch: "main", db: "nobino_test", bytes: 2048 }));
      // فایل نامعتبر نباید در فهرست بیاید
      writeFileSync(join(dir, "notes.txt"), "ignore me");
      writeFileSync(join(dir, "nobino-x-2026.dump"), "not matching stamp");

      const list = await M.listBackups();
      assert.equal(list.length, 2, "فقط نام‌های مطابق الگو");
      assert.equal(list[0].name, "nobino-bbbbbbb-20261105-101010.dump", "تازه‌ترین اول");
      assert.equal(list[0].engine, "pg");
      assert.equal(list[0].bytes, 2048);
      assert.equal(list[1].kind, "pre-restore");
      assert.equal(list[1].engine, "json");
      assert.equal(list[1].rows, 900);
      assert.equal(list[1].label, "پیش از بازگردانی");
      assert.equal(list[1].createdAt, "2026-11-01T10:10:10Z");
    } finally {
      if (prevOverride === undefined) delete globalThis.__NOBINO_BACKUP_DIR__;
      else globalThis.__NOBINO_BACKUP_DIR__ = prevOverride;
      if (prevUrl !== undefined) process.env.DATABASE_URL = prevUrl;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("پوشهٔ نباشد = فهرست خالی (خطا نمی‌دهد)", async (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    const prev = globalThis.__NOBINO_BACKUP_DIR__;
    try {
      globalThis.__NOBINO_BACKUP_DIR__ = join(tmpdir(), "nobino-missing-dir-" + Date.now());
      assert.deepEqual(await M.listBackups(), []);
      assert.deepEqual(await M.rotate(), []);
    } finally {
      if (prev === undefined) delete globalThis.__NOBINO_BACKUP_DIR__;
      else globalThis.__NOBINO_BACKUP_DIR__ = prev;
    }
  });

  test("deleteBackup و backupFilePath نام بد را رد می‌کنند", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    for (const bad of ["../../x", "x.dump", "nobino-a-2026.dump"]) {
      assert.throws(() => M.deleteBackup(bad), /معتبر نیست/);
      assert.throws(() => M.backupFilePath(bad), /معتبر نیست/);
    }
  });

  test("مشاغل قفل درونی را از بیرون نمی‌دهند و سرور آزاد است", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    assert.equal(M.startJob, undefined, "startJob درونی است؛ از بیرون قابل دزدیدن قفل نیست");
    assert.equal(M.finishJob, undefined, "finishJob هم صادر نمی‌شود");
    if (M.currentJob()) t.skip("در این پروسه کاری در جریان است");
    assert.equal(M.currentJob(), null, "پیش از هر کار، سرور آزاد است");
    assert.doesNotThrow(() => M.assertIdle());
    assert.ok(Array.isArray(M.recentJobs()), "گزارش کارهای اخیر آرایه است");
  });
});

/* ── جملهٔ درج چندردیفی ────────────────────────────────────────────────── */
describe("جملهٔ INSERT موتور json", () => {
  const cols = [
    { attname: "id", type: "text" },
    { attname: "price", type: "integer" },
    { attname: "blob", type: "bytea" },
  ];

  test("هر ردیف placeholder یکتا دارد و تعدادشان دقیقاً ستون×ردیف است", (t) => {
    if (skipIfNoBuild(t)) return;
    const sql = B().multiRowInsert("Salon", cols, 3);
    const found = sql.match(/\$\d+/g) || [];
    assert.equal(found.length, 9, "۳ ردیف × ۳ ستون = ۹ پارامتر");
    assert.deepEqual([...new Set(found)].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), ["$1", "$2", "$3", "$4", "$5", "$6", "$7", "$8", "$9"], "هیچ پارامتری تکراری نیست");
    assert.match(sql, /INSERT INTO "Salon" \("id", "price", "blob"\)/);
    assert.match(sql, /\$3::text.*decode\(/, "bytea باید decode شود");
  });

  test("ردیف اول و دوم شمارهٔ متفاوت می‌گیرند (خطای 42P18 قبلی)", (t) => {
    if (skipIfNoBuild(t)) return;
    const two = B().multiRowInsert("Salon", [{ attname: "a", type: "text" }], 2);
    assert.equal(two, 'INSERT INTO "Salon" ("a") VALUES ($1::text), ($2::text)');
  });

  test("صفر ردیف و ستون بی‌نام جملهٔ نامعتبر نمی‌سازد", (t) => {
    if (skipIfNoBuild(t)) return;
    const M = B();
    assert.match(M.multiRowInsert("T", cols, 0), /VALUES\s*$/, "ردیفی نیست");
    assert.match(M.multiRowInsert('we"ird', [], 1), /"we""ird"/, "نام جدول escape شود");
  });

  test("ستون محاسبه‌شده (attgenerated) از درج بیرون می‌ماند", (t) => {
    if (skipIfNoBuild(t)) return;
    const src = read("backend", "src", "lib", "db-backup.ts");
    assert.ok(!/gen === ""/.test(src), "مقایسه با رشتهٔ خالی: درایور «\\u0000» می‌دهد و همهٔ ستون‌ها حذف می‌شدند");
    assert.match(src, /g !== "s" && g !== "d"/, "پالایش درستِ attgenerated");
  });

  test("pg_get_serial_sequence نام CamelCase را با نقل‌قول می‌گیرد", (t) => {
    if (skipIfNoBuild(t)) return;
    const src = read("backend", "src", "lib", "db-backup.ts");
    assert.match(src, /to_regclass\(\$1\)/, "وگرنه «public.Discount» با 42P01 رد می‌شود");
  });
});

/* ── پیمان API و نگهبان‌های امنیت ──────────────────────────────────────── */
describe("مسیرهای API بکاپ", () => {
  const manifest = () => JSON.parse(read("backend", "src", "routes", "manifest.json"));
  const wanted = [
    ["admin/backups", ["GET", "POST", "PATCH"]],
    ["admin/backups/[name]", ["DELETE"]],
    ["admin/backups/[name]/download", ["GET"]],
    ["admin/backups/[name]/restore", ["POST"]],
  ];

  test("هر چهار مسیر در manifest ثبت است و هندلرش وجود دارد", () => {
    const list = manifest();
    for (const [path, methods] of wanted) {
      const hit = list.find((r) => r.path === path);
      assert.ok(hit, `مسیر ${path} در manifest نیست`);
      assert.deepEqual(hit.methods, methods, `متدهای ${path}`);
      assert.ok(/^\/api\//.test(hit.url), "url باید با /api/ شروع شود");
      const mod = join(ROOT, "backend", "src", ...hit.module.replace(/^@\//, "").split("/")) + ".ts";
      assert.ok(require("node:fs").existsSync(mod), `فایل هندلر ${hit.module} پیدا نشد`);
      const src = readFileSync(mod, "utf8");
      for (const m of methods) assert.ok(new RegExp(`export (async )?function ${m}\\b`).test(src), `${path} متد ${m} را export نمی‌کند`);
    }
  });

  test("controller تولیدشده مسیرهای بکاپ را دارد", () => {
    const src = read("backend", "src", "controllers", "admin.controller.ts");
    assert.ok(src.includes("admin/backups"), "کنترلر admin مسیر بکاپ را نمی‌شناسد");
    assert.ok(src.includes("restore"), "متد بازگردانی در کنترلر نیست");
  });

  test("بازگردانی کلمهٔ ROLLBACK، رمز و سقف تلاش را الزامی می‌کند", () => {
    const src = read("backend", "src", "routes", "api", "admin__backups__name__restore.ts");
    assert.match(src, /ROLLBACK/, "تأیید با کلمهٔ ROLLBACK");
    assert.match(src, /verifyPassword/, "رمز عبور باید دوباره تأیید شود");
    assert.match(src, /checkRate/, "سقف تلاش لازم است");
    assert.match(src, /requireRole\(\["ADMIN"\]\)/, "فقط ادمین");
    assert.match(src, /snapshotFirst/, "بکاپ ایمنی پیش از بازگردانی");
  });

  test("هیچ نوک بکاپی نشانی خام دیتابیس را به کلاینت نمی‌فرستد", () => {
    for (const f of ["admin__backups.ts", "admin__backups__name.ts", "admin__backups__name__download.ts", "admin__backups__name__restore.ts"]) {
      const src = read("backend", "src", "routes", "api", f);
      assert.ok(!/process\.env\.DATABASE_URL/.test(src), `${f} نباید DATABASE_URL را مستقیم بخواند`);
      assert.ok(!/\bdbUrl\s*\(/.test(src), `${f} نباید نشانی خام را serialize کند`);
      assert.match(src, /requireRole\(\["ADMIN"\]\)/, `${f} فقط برای ادمین باید باز شود`);
    }
    const status = read("backend", "src", "lib", "db-backup.ts");
    assert.match(status, /masked/, "وضعیت فقط نشانی ماسک‌شده می‌دهد");
  });

  test("دانلود بدون کش و با Content-Disposition ارائه می‌شود", () => {
    const src = read("backend", "src", "routes", "api", "admin__backups__name__download.ts");
    assert.match(src, /no-store/);
    assert.match(src, /Content-Disposition/);
    assert.match(src, /MAX_DOWNLOAD_BYTES|200/, "سقف حجم دانلود");
  });

  test("UI پنل تب پشتیبان‌گیری را در منو و سوئیچ تب دارد", () => {
    assert.match(read("frontend", "src", "components", "AdminShell.tsx"), /tab=backup/);
    assert.match(read("frontend", "src", "components", "AdminExtras.tsx"), /tab === "backup"/);
    const ui = read("frontend", "src", "components", "AdminBackups.tsx");
    assert.match(ui, /ROLLBACK/, "دیالوگ بازگردانی کلمهٔ تأیید می‌خواهد");
    assert.match(ui, /\/api\/admin\/backups/);
  });

  test("پوشهٔ backups در گیت نادیده می‌ماند", () => {
    const gi = read(".gitignore");
    assert.match(gi, /backups/, "فایل‌های بکاپ نباید وارد گیت شوند");
  });
});
