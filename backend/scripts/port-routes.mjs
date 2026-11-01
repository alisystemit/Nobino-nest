/**
 * اسکریپت مهاجرت routeهای Next به ماژول‌های Nest:
 * هر فایل route.ts زیر src/app/api به یک ماژول TS در backend/src/routes تبدیل می‌شود
 * که همان تابع‌های GET/POST/... را با امضای Web API صادر می‌کند (بدون تغییر منطق).
 * سپس manifest تولید می‌شود که gen-controllers.mjs بر اساس آن controllerها را می‌سازد.
 *
 * اجرا: node scripts/port-routes.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, posix } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const API_SRC = join(ROOT, "src", "app", "api");
const ROUTES_OUT = join(ROOT, "backend", "src", "routes");
const NEXT_PUBLIC_EXPORTS = /^(export\s+const\s+(dynamic|revalidate|instant|runtime|maxDuration)\b[^\n]*\n)/gm;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.name === "route.ts") out.push(p);
  }
  return out;
}

function segmentToParam(seg) {
  const m = seg.match(/^\[\.\.\.(\w+)\]$/);
  if (m) return `*${m[1]}`;
  const m2 = seg.match(/^\[(\w+)\]$/);
  if (m2) return `:${m2[1]}`;
  return seg;
}

function fileNameFromRel(relDir) {
  return relDir
    .split("/")
    .map((s) => s.replace(/\.\.\.(\w+)/, "$1").replace(/^\[(\w+)\]$/, "$1"))
    .join("__");
}

const manifest = [];
for (const file of walk(API_SRC)) {
  const relDir = file.slice(API_SRC.length + 1).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
  let code = readFileSync(file, "utf8").replace(/^\uFEFF/, "");

  // حذف exportهای تنظیمات Next
  code = code.replace(NEXT_PUBLIC_EXPORTS, "");
  // next/headers → shim مشترک
  code = code.replace(/from\s+"next\/headers"/g, 'from "@/compat/next-headers"');

  const methods = [...code.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g)].map(
    (m) => m[1],
  );
  if (methods.length === 0) {
    console.warn("متد HTTP ندارد، نادیده گرفته شد:", relDir);
    continue;
  }

  // تبدیل امضای ctx: params به‌جای Promise، خود شیء پارامترها را هم می‌پذیرد
  // (await روی مقدار ساده بی‌ضرر است و بدنه route بدون تغییر می‌ماند)
  code = code.replace(
    /\{\s*params\s*\}\s*:\s*\{\s*params\s*:\s*Promise<([^>]+(?:>[^,>]+)?)>\s*\}/g,
    "{ params }: { params: $1 | Promise<$1> }",
  );
  // هندلرهایی که آرگومان دوم (ctx) ندارند: اضافه‌کردن _ctx برای سازگاری با Nest glue
  code = code.replace(
    /export async function (GET|POST|PUT|PATCH|DELETE)\((\s*)([A-Za-z_]\w*)\s*(?::\s*Request)?\2\)/g,
    (m, fn, sp, arg) =>
      `export async function ${fn}(${arg}: Request, _ctx: { params: Record<string, string> })`,
  );
  code = code.replace(
    /export async function (GET|POST|PUT|PATCH|DELETE)\(\s*\)/g,
    "export async function $1(_req: Request, _ctx: { params: Record<string, string> })",
  );

  const outName = fileNameFromRel(relDir || "_root");
  const outDir = join(ROUTES_OUT, "api");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${outName}.ts`);
  writeFileSync(outFile, `// خودکار: پورت‌شده از src/app/api/${relDir}/route.ts — بدون تغییر منطق\n${code}`, "utf8");

  manifest.push({
    path: relDir,
    url: "/api/" + (relDir.split("/").map(segmentToParam).join("/") || ""),
    module: `@/routes/api/${outName}`,
    methods,
  });
}

// manifest برای gen-controllers
mkdirSync(join(ROUTES_OUT), { recursive: true });
writeFileSync(join(ROUTES_OUT, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(`${manifest.length} route پورت شد → ${ROUTES_OUT}`);
