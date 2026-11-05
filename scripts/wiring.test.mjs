// تست سازگاری سیم‌کشی بک‌اند: manifest ↔ فایل روت ↔ کنترلر تولیدشده ↔ کدهای فرانت
// اجرا: npm test   (نیازمند بیلد یا دیتابیس نیست)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, posix } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const BACKEND = join(ROOT, "backend");
const read = (...p) => readFileSync(join(ROOT, ...p), "utf8");

const MANIFEST = JSON.parse(read("backend", "src", "routes", "manifest.json"));
const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const METHOD_DECORATOR = { GET: "Get", POST: "Post", PUT: "Put", PATCH: "Patch", DELETE: "Delete" };

/** همان گروه‌بندی gen-controllers.mjs — اگر آن عوض شود این تست خطا می‌دهد تا هماهنگ بمانند */
const GROUPS = [
  { file: "auth", match: (p) => p.startsWith("auth/") },
  { file: "cron", match: (p) => p.startsWith("cron/") },
  { file: "admin", match: (p) => p.startsWith("admin/") },
  { file: "ai", match: (p) => p.startsWith("ai/") || p.startsWith("voice/") },
  { file: "payments", match: (p) => p.startsWith("payments/") || p.startsWith("pay/") },
  { file: "finance", match: (p) => /^(wallet|commission|giftcards|loyalty)(\/|$)/.test(p) },
  { file: "appointments", match: (p) => p.startsWith("appointments/") },
  { file: "dashboard", match: (p) => p.startsWith("dashboard/") },
  { file: "salons", match: (p) => p.startsWith("salons/") },
  {
    file: "engagement",
    match: (p) => /^(notifications|favorites|support|account|upload|bookings)(\/|$)/.test(p),
  },
  { file: "public", match: () => true },
];

/** کنترلرهای دستی (در manifest نیستند و gen-controllers آن‌ها را نمی‌نویسد) */
const HAND_WRITTEN = ["pages.controller.ts", "admin/ai/status.controller.ts", "admin/ai/test.controller.ts"];

/** قرارداد Next→Nest: بخش [x] در path به :x در url تبدیل می‌شود.
 *  نام فایل روت همان module است (منبع حقیقت manifest)؛ بررسی می‌کنیم فایلش موجود باشد
 *  و هیچ فایل روتی بیرون از manifest جا نمانده باشد. */
const toUrl = (p) => "/api/" + p.replace(/\[([^\]]+)\]/g, ":$1");
const moduleFileOf = (entry) => {
  assert.ok(entry.module.startsWith("@/routes/api/"), `${entry.path}: module باید زیر @/routes/api/ باشد`);
  return "backend/src/routes/api/" + entry.module.slice("@/routes/api/".length) + ".ts";
};
const routeFileOf = (entry) => moduleFileOf(entry);

const walkTs = (relDir, acc = []) => {
  const abs = join(ROOT, relDir);
  if (!existsSync(abs)) return acc;
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    if (["node_modules", "dist", "dist-apk", ".next"].includes(ent.name)) continue;
    const rel = posix.join(relDir, ent.name);
    if (ent.isDirectory()) walkTs(rel, acc);
    else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(rel);
  }
  return acc;
};

test("manifest: شکل سالم، یکتا و منطبق بر قرارداد path/url/module", () => {
  assert.ok(Array.isArray(MANIFEST), "manifest باید آرایه باشد");
  const seenPath = new Set();
  const seenUrl = new Set();
  const seenModule = new Set();
  for (const e of MANIFEST) {
    assert.ok(e.path && typeof e.path === "string", `path ندارد: ${JSON.stringify(e)}`);
    assert.equal(e.url, toUrl(e.path), `${e.path}: url باید /api/<path> با :param باشد (یافته: ${e.url})`);
    assert.ok(e.module.startsWith("@/routes/api/"), `${e.path}: module باید زیر @/routes/api/ باشد`);
    assert.ok(Array.isArray(e.methods) && e.methods.length > 0, `${e.path}: methods خالی است`);
    for (const m of e.methods) assert.ok(VERBS.includes(m), `${e.path}: روش ناشناختهٔ ${m}`);
    assert.equal(new Set(e.methods).size, e.methods.length, `${e.path}: روش تکراری`);
    assert.ok(!seenPath.has(e.path), `path تکراری: ${e.path}`);
    assert.ok(!seenUrl.has(e.url), `url تکراری: ${e.url}`);
    assert.ok(!seenModule.has(e.module), `module تکراری: ${e.module}`);
    seenPath.add(e.path);
    seenUrl.add(e.url);
    seenModule.add(e.module);
  }
});

test("manifest: هر مدول فایل روت خودش را دارد و فایل یتیمی جا نگرفته", () => {
  for (const e of MANIFEST) {
    const rel = routeFileOf(e);
    assert.ok(existsSync(join(ROOT, rel)), `${e.path}: فایل روت ${rel} وجود ندارد`);
  }
  const declared = new Set(MANIFEST.map(routeFileOf));
  const orphans = walkTs("backend/src/routes/api").filter((f) => !declared.has(f));
  assert.deepEqual(orphans, [], "فایل روت بدون مدول در manifest (فراموش شده؟): " + orphans.join(", "));
});

test("فایل روت: برای هر methods یک export هم‌نام دارد", () => {
  for (const e of MANIFEST) {
    const src = read(...routeFileOf(e).split("/"));
    for (const m of e.methods) {
      assert.match(src, new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`), `${e.path}: export ${m} نیست`);
    }
    for (const other of VERBS.filter((v) => !e.methods.includes(v))) {
      const exported = new RegExp(`export\\s+(async\\s+)?function\\s+${other}\\b`).test(src);
      assert.ok(!exported, `${e.path}: ${other} export شده ولی در manifest ثبت نشده`);
    }
  }
});

test("کنترلرهای تولیدشده با manifest هم‌خوان‌اند (gen-controllers اجرا شده)", () => {
  const expected = new Map();
  for (const e of MANIFEST) {
    const g = GROUPS.find((grp) => grp.match(e.path));
    assert.ok(g, `${e.path}: به هیچ گروه کنترلری نمی‌خورد`);
    if (!expected.has(g.file)) expected.set(g.file, new Set());
    for (const m of e.methods) expected.get(g.file).add(`${METHOD_DECORATOR[m]}("${e.url}")`);
  }
  for (const [file, want] of expected) {
    const rel = `backend/src/controllers/${file}.controller.ts`;
    assert.ok(existsSync(join(ROOT, rel)), `${rel} وجود ندارد — npm run gen:controllers بزنید`);
    const src = read(...rel.split("/"));
    const have = new Set([...src.matchAll(/@(Get|Post|Put|Patch|Delete)\("([^"]+)"\)/g)].map((m) => `${m[1]}("${m[2]}")`));
    const missing = [...want].filter((x) => !have.has(x));
    const extra = [...have].filter((x) => !want.has(x));
    assert.deepEqual(missing, [], `${rel}: مسیر/متد جاافتاده (gen:controllers لازم است)`);
    assert.deepEqual(extra, [], `${rel}: مسیر/متد اضافه در کنترلر تولیدشده`);
  }
});

/** مسیرهای سروشده توسط ops-middleware (بدون کنترلر): سلامت + healthz */
const MIDDLEWARE_URLS = ["/api/health", "/healthz"];

/** همهٔ مسیرهای دست‌نویس (کنترلرهایی که gen-controllers نمی‌نویسدشان)
 *  پیشوند @Controller() + مسیر @Get()/@Post() (مسیر خالی = خودِ پیشوند). */
function handWrittenUrls() {
  return HAND_WRITTEN.flatMap((f) => {
    const src = read("backend", "src", "controllers", ...f.split("/"));
    const prefix = (src.match(/@Controller\(\s*["'`]([^"'`]*)["'`]\s*\)/) || [, ""])[1].replace(/^\/+|\/+$/g, "");
    return [...src.matchAll(/@(?:Get|Post|Put|Patch|Delete)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g)].map((m) => {
      const sub = (m[1] || "").replace(/^\/+/, "");
      return "/" + [prefix, sub].filter(Boolean).join("/");
    });
  });
}

test("دست‌نوشته‌های استثنا: فقط کنترلرهای مجاز بیرون از تولید خودکارند", () => {
  const generated = new Set(GROUPS.map((g) => `${g.file}.controller.ts`));
  const actual = walkTs("backend/src/controllers").map((f) => f.replace("backend/src/controllers/", ""));
  const notGenerated = actual.filter((f) => !generated.has(f)).sort();
  assert.deepEqual(notGenerated, [...HAND_WRITTEN].sort(), "فهرست کنترلرهای دستی با تست یکی نیست (یا gen:controllers اجرا نشده)");
});

test("دست‌نوشته‌ها: مسیرهای pages و admin/ai با manifest نمی‌کوبند", () => {
  const urls = new Set(MANIFEST.map((e) => e.url));
  const clash = handWrittenUrls().filter((u) => urls.has(u));
  assert.deepEqual(clash, [], `مسیر دست‌نویس با manifest می‌کوبد: ${clash.join(", ")}`);
});

test("هیچ مسیر /api در کد فرانت/بک‌اند/اسکریپت‌ها بی‌صاحب نیست", () => {
  const norm = (s) =>
    String(s)
      .split("?")[0]
      .replace(/:[A-Za-z0-9_]+/g, "*")
      .replace(/\$\{[^}]*\}/g, "*")
      .replace(/\{[^}]*\}/g, "*")
      .replace(/\/+$/, "");
  const patterns = [...MANIFEST.map((e) => e.url), ...handWrittenUrls(), ...MIDDLEWARE_URLS].map((u) => {
    const re = norm(u)
      .split("/")
      .map((seg) => (seg === "*" ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/");
    return new RegExp("^" + re + "$");
  });
  const known = new Map(MANIFEST.map((e) => [norm(e.url), e.url]));
  const resolves = (literal) => {
    const n = norm(literal);
    if (known.has(n)) return true;
    return patterns.some((re) => re.test(n));
  };
  const files = [...walkTs("frontend/src"), ...walkTs("backend/src"), ...walkTs("scripts")];
  const bad = [];
  for (const f of files) {
    read(...f.split("/"))
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const m of line.matchAll(/["'`](\/api\/[A-Za-z0-9_$&{}/:.\-]+)["'`]/g)) {
          if (!resolves(m[1])) bad.push(`${f}:${i + 1} → ${m[1]}`);
        }
      });
  }
  assert.deepEqual(bad, [], "مسیرهای /api ثبت‌نشده در manifest:\n" + bad.join("\n"));
});

test("CronJobsService: هر @Cron تعریف‌شده مسیرش را از manifest می‌گیرد", () => {
  const svc = read("backend", "src", "cron", "cron-jobs.service.ts");
  const fired = [...svc.matchAll(/this\.fire\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(fired.length > 0, "CronJobsService هیچ کرانی را صدا نمی‌زند");
  const declared = new Set(MANIFEST.filter((e) => e.path.startsWith("cron/")).map((e) => e.path));
  const ghost = fired.filter((p) => !declared.has(p));
  assert.deepEqual(ghost, [], `کران‌هایی در CronJobsService هستند ولی route/manifest ندارند: ${ghost.join(", ")}`);
});
