// بررسی مکانیکی فرانت: فایل‌های بی‌مصرف، مسیرهای لینک‌های مرده، importهای حل‌نشدنی
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, posix } from "node:path";

const ROOT = process.cwd();
const SRC = "frontend/src";
const R = (p) => readFileSync(join(ROOT, p), "utf8");
const walk = (dir, acc = []) => {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = posix.join(dir, e.name);
    if (e.isDirectory()) walk(rel, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(rel);
  }
  return acc;
};
const files = walk(SRC);
const text = new Map(files.map((f) => [f, R(f)]));

/* ۱) importهای محلی که فایلشان نیست */
const broken = [];
for (const [f, t] of text) {
  for (const m of t.matchAll(/from\s+["'](@\/[^"']+|\.\.?\/[^"']+)["']/g)) {
    const spec = m[1];
    const base = spec.startsWith("@/") ? posix.join(SRC, spec.slice(2)) : posix.normalize(posix.join(posix.dirname(f), spec));
    const ok = ["", ".ts", ".tsx", ".css", "/index.ts", "/index.tsx"].some((x) => existsSync(join(ROOT, base + x)));
    if (!ok) broken.push(`${f} → ${spec}`);
  }
}
console.log(`BROKEN LOCAL IMPORTS: ${broken.length}`);
broken.forEach((b) => console.log("  " + b));

/* ۲) فایل‌های export-default که هیچ‌جا import نشده‌اند */
const imported = new Set();
for (const [, t] of text) {
  for (const m of t.matchAll(/from\s+["'](@\/[^"']+|\.\.?\/[^"']+)["']/g)) imported.add(m[1]);
}
const dead = [];
for (const f of files) {
  const t = text.get(f);
  if (!/export default/.test(t)) continue;
  if (/main\.tsx|vite-env/.test(f)) continue;
  const rel = f.slice(SRC.length + 1).replace(/\.tsx?$/, "");
  const spec = "@/" + rel;
  const used = imported.has(spec) || imported.has(spec.replace(/\.tsx$/, "")) ||
    [...imported].some((s) => {
      if (!s.startsWith(".") && !s.startsWith("@/")) return false;
      return posix.normalize(posix.join(posix.dirname(f), s)).endsWith(posix.basename(f).replace(/\.tsx?$/, ""));
    });
  // lazy()/dynamic import هم شمارش می‌شود
  const dyn = [...text.values()].some((o) => o.includes(rel + '"') || o.includes(rel + "'") || o.includes(posix.basename(rel)));
  if (!used && !dyn) dead.push(f);
}
console.log(`UNREFERENCED DEFAULT-EXPORT FILES: ${dead.length}`);
dead.forEach((d) => console.log("  " + d));

/* ۳) مسیرهای to= / navigate( که در هیچ route path یا switch ای نیست */
const appRoutes = new Set();
for (const f of files) {
  const t = text.get(f);
  for (const m of t.matchAll(/<Route\s+path=["']([^"']+)["']/g)) appRoutes.add(m[1]);
}
const roots = ["frontend/src/App.tsx", "frontend/src/mini/MiniApp.tsx", `${SRC}/dashmini/DashMiniApp.tsx`].filter((f) => existsSync(join(ROOT, f)));
const flat = new Set();
for (const r of appRoutes) flat.add(r.replace(/^\*\+?$/, "*"));
const prefixes = { mini: "/mini", dash: "/dash" };
const targets = new Map();
for (const f of files) {
  const t = text.get(f);
  for (const m of t.matchAll(/(?:to|href)=\{?["'](\/[^"'}]+)["']|navigate\(\s*["'](\/[^"'`]+)["']/g)) {
    const p = m[1] || m[2];
    if (!p || p.startsWith("//")) continue;
    (targets.get(p) || targets.set(p, []).get(p)).push(f);
  }
}
const known = (p) => {
  for (const r of appRoutes) {
    const rr = r.replace(/\$\{[^}]*\}/g, "*");
    for (const [k, pre] of Object.entries(prefixes)) {
      const full = (rr === "/" || rr === "" ? pre : pre + rr).replace(/:[A-Za-z0-9_]+/g, "*");
      if (p === full || p.startsWith(full + "/")) return true;
    }
    const plain = rr.replace(/:[A-Za-z0-9_]+/g, "*");
    if (p === plain || p.startsWith(plain + "/")) return true;
  }
  return false;
};
const dead2 = [...targets].filter(([p]) => !known(p));
console.log(`LINK/NAV TARGETS WITH NO ROUTE: ${dead2.length}`);
dead2.forEach(([p, list]) => console.log(`  ${p}  ← ${[...new Set(list)].slice(0, 3).join(", ")}`));
console.log(`(route paths found: ${appRoutes.size})`);
