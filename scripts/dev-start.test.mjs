// تست scripts/dev-start.mjs (یافته‌های ME-7 از docs/audit-scripts-2026-11-05.md)
//  • قفل کهنه: .dev.pids بازمانده از kill -9 نباید «npm run dev» را برای همیشه ببندد
//  • spawn بدون shell با مسیر مطلق (DEP0190 + شکستن مسیرهای دارای فاصله)
//  • «✅ شروع شد» فقط بعد از پاسخ واقعی /api/health
// اجرا: npm test   |   اجرای واقعیِ سرورها در این تست انجام نمی‌شود.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const src = readFileSync(join(ROOT, "scripts", "dev-start.mjs"), "utf8");

describe("dev-start — قفل PID", () => {
  test(".dev.pids با PID زنده → با کد ۱ و پیام «npm run stop» متوقف می‌شود", () => {
    const dir = mkdtempSync(join(tmpdir(), "nobino-devstart-"));
    try {
      mkdirSync(join(dir, "scripts"), { recursive: true });
      cpSync(join(ROOT, "scripts", "dev-start.mjs"), join(dir, "scripts", "dev-start.mjs"));
      // PIDِ همین تست‌رانر زنده است → قفل باید واقعاً نگه دارد
      writeFileSync(join(dir, ".dev.pids"), `backend\t${process.pid}\nfrontend\t${process.pid}\n`, "utf8");
      const r = spawnSync(process.execPath, [join(dir, "scripts", "dev-start.mjs")], { encoding: "utf8", timeout: 30_000 });
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert.match(r.stderr, /هنوز اجرا می‌شود/);
      assert.match(r.stderr, /npm run stop/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("قفل کهنه (PID مرده) پاک می‌شود، نه اینکه اجرا را ببندد", () => {
    assert.match(src, /const isAlive = \(pid\) =>/);
    assert.match(src, /process\.kill\(pid, 0\)/);
    assert.match(src, /rmSync\(PIDS_FILE, \{ force: true \}\)/);
    assert.match(src, /\.dev\.pids کهنه بود/);
    // بررسی زنده‌بودن باید اولین کار باشد (پیش از prisma generate و build)
    const guardAt = src.indexOf("existsSync(PIDS_FILE)");
    const buildAt = src.indexOf('execSync("npm run build:backend"');
    assert.ok(guardAt > -1 && guardAt < buildAt, "گارد PID قبل از build اجرا شود");
  });
});

describe("dev-start — spawn و گزارش موفقیت", () => {
  test("بدون shell و با خودِ نود: مسیر مطلق دیگر به پوسته سپرده نمی‌شود", () => {
    assert.doesNotMatch(src, /shell:\s*process\.platform/, "DEP0190 / شکستن مسیرهای دارای فاصله");
    assert.match(src, /spawn\(process\.execPath, args/);
    assert.match(src, /execFileSync\(process\.execPath, \[prismaCli, "generate"\]/);
    // vite مستقیم از باینری خودش (پوستهٔ npm PIDِ فرانت را عوض می‌کرد و dev-stop را می‌شکست)
    assert.match(src, /vite", "bin", "vite\.js"/);
    assert.doesNotMatch(src, /start\("frontend", "npm"/);
  });

  test("«✅ شروع شد» پشت health check می‌ماند", () => {
    assert.match(src, /async function waitHttp\(url, name\)/);
    assert.match(src, /\/api\/health/);
    const successAt = src.indexOf("✅ شروع شد");
    const gateAt = src.indexOf("const backendOk = await waitHttp");
    assert.ok(gateAt > -1 && gateAt < successAt, "پیام موفقیت بعد از بررسی سلامت چاپ شود");
    assert.match(src, /process\.exitCode = 1/);
    assert.match(src, /tailLog\("backend"\)/, "لاگ بک‌اند هنگام شکست چاپ شود");
  });

  test("فورمت .dev.pids برای dev-stop دست‌نخورده می‌ماند", () => {
    assert.match(src, /pids\.map\(\(p\) => `\$\{p\.name\}\\t\$\{p\.pid\}`\)/);
    const stop = readFileSync(join(ROOT, "scripts", "dev-stop.mjs"), "utf8");
    assert.match(stop, /line\.split\("\\t"\)/);
  });
});
