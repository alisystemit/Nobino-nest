// بخش ۵ (بازنویسی): هر رشتهٔ /api/... که در کد (SPA یا بک‌اند) به‌صورت حرفی آمده،
// با نشانی‌های manifest مقایسه می‌شود؛ :param و ${...} هر دو به * تبدیل می‌شوند.
import { readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";

const ROOT = process.cwd();
const R = (p) => readFileSync(join(ROOT, p), "utf8");
const man = JSON.parse(R("backend/src/routes/manifest.json"));
const norm = (s) => String(s).split("?")[0].replace(/:[A-Za-z0-9_]+/g, "*").replace(/\$\{[^}]*\}/g, "*").replace(/\{[^}]*\}/g, "*").replace(/\/+$/, "");
const urls = new Map(man.map((e) => [norm(e.url), e.url]));

const walk = (dir, acc = []) => {
  for (const ent of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (["node_modules", "dist", "dist-apk", ".next"].includes(ent.name)) continue;
    const rel = posix.join(dir, ent.name);
    if (ent.isDirectory()) walk(rel, acc);
    else if (/\.(ts|tsx)$/.test(ent.name)) acc.push(rel);
  }
  return acc;
};
const files = [...walk("frontend/src"), ...walk("backend/src"), ...walk("scripts")];
const hits = new Map();
for (const f of files) {
  const t = R(f);
  t.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/["'`](\/api\/[A-Za-z0-9_$&{}/:.\-]*)["'`]/g)) {
      const raw = m[1];
      const key = norm(raw);
      if (!urls.has(key)) {
        if (!hits.has(key)) hits.set(key, []);
        hits.get(key).push(`${f}:${i + 1} ${raw}`);
      }
    }
  });
}
console.log(`UNMATCHED /api PATHS: ${hits.size}`);
for (const [k, list] of [...hits].sort()) console.log(`\n### ${k}\n` + list.slice(0, 4).map((x) => "   " + x).join("\n"));
