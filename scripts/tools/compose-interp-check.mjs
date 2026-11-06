// بازسازی منطق جای‌گذاری متغیرهای docker compose (فرم ${VAR:-default}) روی
// خط DATABASE_URL فایل compose، با دو سناریو: قالب .env و دیتابیس managed.
// داکر روی این ماشین نصب نیست؛ این اسکریپت فقط رشتهٔ نهایی را نشان می‌دهد.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** خواندن .env به سبک compose (بدون export، بدون کامنت) */
function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** جای‌گذاری ${VAR} و ${VAR:-default} با پارسر آکولاد (تودرتو مجاز است) */
function interp(str, env) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== "$" || str[i + 1] !== "{") {
      out += str[i];
      continue;
    }
    // یافتن «}» جفت با شمارش عمق
    let depth = 1;
    let j = i + 2;
    for (; j < str.length && depth > 0; j++) {
      if (str[j] === "}") depth--;
      else if (str[j] === "{") depth++;
    }
    const inner = str.slice(i + 2, j - 1);
    i = j - 1;
    const idx = inner.indexOf(":-");
    if (idx === -1) {
      out += env[inner] ?? "";
      continue;
    }
    const name = inner.slice(0, idx);
    const def = inner.slice(idx + 2);
    const val = env[name];
    out += val !== undefined && val !== "" ? val : interp(def, env);
  }
  return out;
}

// خط DATABASE_URL را از خودِ فایل compose برمی‌داریم (نه از تقلد دستی)
const compose = readFileSync(resolve(ROOT, "docker-compose.yml"), "utf8");
const line = compose.split(/\r?\n/).find((l) => l.trim().startsWith("DATABASE_URL:"));
if (!line) throw new Error("خط DATABASE_URL در compose پیدا نشد");
const expr = line.slice(line.indexOf(":") + 1).trim();
console.log("عبارت compose :", expr);

const template = parseEnv(readFileSync(resolve(ROOT, "deploy/env.production.example"), "utf8"));

function scenario(name, env) {
  const resolved = interp(expr, env);
  console.log(`\n── ${name} ──`);
  console.log("DATABASE_URL در .env :", env.DATABASE_URL ?? "(ست نشده)");
  console.log("APP_DATABASE_URL     :", env.APP_DATABASE_URL ?? "(ست نشده)");
  console.log("→ کانتینر می‌گیرد    :", resolved);
  return resolved;
}

const a = scenario("قالب .env کپی‌شده (دیتابیس داخل compose)", template);
const managed = "postgresql://user:pass@db.example.com:6432/nobino?sslmode=require";
const b = scenario("دیتابیس managed با APP_DATABASE_URL", {
  ...template,
  APP_DATABASE_URL: managed,
});

let fail = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
  if (!ok) fail++;
};
console.log("\n════ نتیجه ════");
check(!a.includes("localhost"), "در حالت پیش‌فرض، نشانی localhost نشت نمی‌کند (جلوگیری از crash-loop)");
check(a.includes("@db:5432/nobino"), "پیش‌فرض به سرویس «db» اشاره می‌کند: " + a);
check(a.includes("CHANGE_ME_strong_password"), "رمز از POSTGRES_PASSWORD خوانده می‌شود");
check(b === managed, "APP_DATABASE_URL بر پیش‌فرض مقدم است");

process.exit(fail ? 1 : 0);
