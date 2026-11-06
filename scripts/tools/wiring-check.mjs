// بررسی مکانیکی سیم‌کشی پروژه (فقط خواندن) — manifest ↔ فایل‌ها ↔ کنترلرها ↔ schema ↔ SPA
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, posix } from "node:path";

const ROOT = process.cwd();
const R = (p) => readFileSync(join(ROOT, p), "utf8");
const out = [];
const say = (s) => out.push(s);

/* ── ۱) manifest → فایل روت ───────────────────────────────────────── */
const man = JSON.parse(R("backend/src/routes/manifest.json"));
const missing = [];
const noApi = [];
const dupUrl = new Map();
for (const e of man) {
  const file = posix.join("backend/src", String(e.module).replace(/^@\//, "") + ".ts");
  if (!existsSync(join(ROOT, file))) missing.push(`${e.url} → ${e.module}`);
  if (!String(e.url).startsWith("/api")) noApi.push(`${e.url} (${e.path})`);
  const key = `${e.method || "ALL"} ${e.url}`;
  dupUrl.set(key, (dupUrl.get(key) || 0) + 1);
}
say(`manifest: ${man.length} entry`);
say(`MODULE FILE GONE: ${missing.length}`);
missing.forEach((m) => say("  " + m));
say(`URL WITHOUT /api PREFIX: ${noApi.length}`);
noApi.forEach((m) => say("  " + m));
say(`DUPLICATE URL+METHOD: ${[...dupUrl].filter(([, n]) => n > 1).length}`);
[...dupUrl].filter(([, n]) => n > 1).forEach(([k, n]) => say(`  ${k} ×${n}`));

/* ── ۲) فایل‌های روت بی‌منیفست (مرده) ─────────────────────────────── */
const apiDir = "backend/src/routes/api";
const files = readdirSync(join(ROOT, apiDir)).filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3));
const mods = new Set(man.map((e) => String(e.module).split("/").pop()));
const orphan = files.filter((f) => !mods.has(f));
say(`ORPHAN ROUTE FILES: ${orphan.length}`);
orphan.forEach((o) => say("  " + o));

/* ── ۳) کنترلرهای تولیدشده ↔ manifest ─────────────────────────────── */
const ctrlDir = "backend/src/controllers";
const urls = new Set(man.map((e) => e.url));
const declared = new Set();
const stale = [];
for (const f of readdirSync(join(ROOT, ctrlDir), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name)) {
  if (!f.endsWith(".ts")) continue;
  const t = R(posix.join(ctrlDir, f));
  for (const m of t.matchAll(/@(Get|Post|Patch|Put|Delete)\("([^"]+)"\)/g)) {
    declared.add(m[2]);
    if (!urls.has(m[2])) stale.push(`${f}: ${m[1]} ${m[2]}`);
  }
}
const unhandled = [...urls].filter((u) => !declared.has(u));
say(`CONTROLLER ROUTES NOT IN MANIFEST: ${stale.length}`);
stale.forEach((s) => say("  " + s));
say(`MANIFEST URLS WITH NO CONTROLLER: ${unhandled.length}`);
unhandled.forEach((s) => say("  " + s));

/* ── ۴) export متدهای روت vs manifest ─────────────────────────────── */
const notExported = [];
for (const e of man) {
  const file = posix.join("backend/src", String(e.module).replace(/^@\//, "") + ".ts");
  if (!existsSync(join(ROOT, file))) continue;
  const t = R(file);
  for (const m of e.methods || []) {
    if (!new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(t)) notExported.push(`${m} ${e.url}`);
  }
  const extra = [...t.matchAll(/^export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm)].map((x) => x[1]);
  for (const x of extra) if (!(e.methods || []).includes(x)) notExported.push(`(extra export) ${x} ${e.url}`);
}
say(`METHOD/EXPORT MISMATCH: ${notExported.length}`);
[...new Set(notExported)].forEach((s) => say("  " + s));

/* ── ۵) fetchهای SPA که منیفست ندارند ─────────────────────────────── */
const walk = (dir, acc = []) => {
  for (const ent of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name === "dist-apk") continue;
    const rel = posix.join(dir, ent.name);
    if (ent.isDirectory()) walk(rel, acc);
    else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(rel);
  }
  return acc;
};
const srcFiles = [...walk("frontend/src"), ...walk("backend/src")];
const lit = new Set();
for (const f of srcFiles) {
  const t = R(f);
  for (const m of t.matchAll(/["'`](\/api\/[a-zA-Z0-9_/:\-.]*)["'`]/g)) lit.add(m[1]);
  for (const m of t.matchAll(/["'`]\/api\/([a-zA-Z0-9_\-/{}.]+)["'`]/g)) lit.add("/api/" + m[1]);
}
const pattern = (p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/:[A-Za-z0-9_]+/g, "[^/]+").replace(/\{[^}]+\}/g, "[^/]+") + "$");
const unmatched = [];
for (const p of lit) {
  const clean = p.replace(/\$\{[^}]*\}/g, "X").replace(/\/+$/, "");
  const ok = man.some((e) => {
    const u = String(e.url).replace(/:[A-Za-z0-9_]+/g, "X");
    return u === clean || pattern(e.url.replace(/:[A-Za-z0-9_]+/g, "[^/]+")).test(clean);
  });
  if (!ok) unmatched.push(p);
}
say(`SPA /api LITERALS: ${lit.size} — NOT IN MANIFEST: ${unmatched.length}`);
unmatched.sort().forEach((s) => say("  " + s));

/* ── ۶) پرایزما: مدل‌های بی‌مصرف + فیلدهای ناموجود ────────────────── */
const schema = R("prisma/schema.prisma");
const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
const unused = models.filter((m) => !srcFiles.some((f) => new RegExp(`prisma\\.${m[0].toLowerCase()}${m.slice(1)}\\b`).test(R(f))));
say(`PRISMA MODELS: ${models.length} — UNUSED IN BACKEND: ${unused.length}`);
unused.forEach((s) => say("  " + s));

process.stdout.write(out.join("\n") + "\n");
