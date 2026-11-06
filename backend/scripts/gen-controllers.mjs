/**
 * تولید controllerهای Nest از manifest (منبع حقیقت: backend/src/routes/manifest.json).
 * اجرا:  node backend/scripts/gen-controllers.mjs [--prune]
 *
 *   --prune   کنترلرهای بی‌یتیم را حذف می‌کند (پیش‌فرض: فقط گزارش)
 *   --help    همین راهنما
 *
 * ابزار یک‌بارمصرف port-routes.mjs دیگر لازم نیست؛ مسیرهای تازه را مستقیم در
 * manifest (و فایل route مربوطه) ثبت کنید و این اسکریپت را اجرا کنید.
 * فایل‌های بدون علامتِ «خودکار» (مثل pages.controller.ts) دستی‌اند و هرگز حذف
 * نمی‌شوند.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, posix, relative } from "node:path";

const BACKEND = join(import.meta.dirname, "..");

const USAGE =
  "استفاده: node backend/scripts/gen-controllers.mjs [--prune]\n" +
  "  --prune  کنترلرهای بی‌یتیم (تولیدشده ولی بدون مسیر در مانیفست) را حذف کن\n" +
  "  --help   همین راهنما\n";

const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  console.log(USAGE);
  process.exit(0);
}
const unknown = argv.filter((a) => a !== "--prune");
if (unknown.length) {
  console.error(`ژتون ناشناخته: ${unknown.join(" ")}\n${USAGE}`);
  process.exit(2);
}
const PRUNE = argv.includes("--prune");

const manifest = JSON.parse(readFileSync(join(BACKEND, "src/routes/manifest.json"), "utf8"));

/** گروه‌بندی مسیرها → controller */
const GROUPS = [
  { file: "auth", cls: "AuthController", match: (p) => p.startsWith("auth/") },
  { file: "cron", cls: "CronController", match: (p) => p.startsWith("cron/") },
  { file: "admin", cls: "AdminController", match: (p) => p.startsWith("admin/") },
  { file: "ai", cls: "AiController", match: (p) => p.startsWith("ai/") || p.startsWith("voice/") },
  { file: "payments", cls: "PaymentsController", match: (p) => p.startsWith("payments/") || p.startsWith("pay/") },
  { file: "finance", cls: "FinanceController", match: (p) => /^(wallet|commission|giftcards|loyalty)(\/|$)/.test(p) },
  { file: "appointments", cls: "AppointmentsController", match: (p) => p.startsWith("appointments/") },
  { file: "dashboard", cls: "DashboardController", match: (p) => p.startsWith("dashboard/") },
  { file: "salons", cls: "SalonsController", match: (p) => p.startsWith("salons/") },
  {
    file: "engagement",
    cls: "EngagementController",
    match: (p) => /^(notifications|favorites|support|account|upload|bookings)(\/|$)/.test(p),
  },
  { file: "public", cls: "PublicController", match: () => true },
];

/**
 * ددلاین کران‌ها (منبع حقیقت زمان‌بندی؛ کلید = path در مانیفست).
 * هر کران در مانیفست باید اینجا زمان داشته باشد و برعکس؛ در غیر این صورت
 * تولیدکد با کد ۱ می‌ایستد (LO-5: کران تازه بی‌صدا نادیده گرفته نشود).
 */
const CRON_SCHEDULES = {
  "cron/reminders": "0 * * * *",
  "cron/notifications": "*/5 * * * *",
  "cron/waitlist": "15 * * * *",
  "cron/holds": "*/10 * * * *",
  "cron/subscriptions": "0 2 * * *",
};

const GENERATED_MARK = "تولیدشده توسط backend/scripts/gen-controllers.mjs";

const METHOD_DECORATOR = { GET: "Get", POST: "Post", PUT: "Put", PATCH: "Patch", DELETE: "Delete" };

function methodName(url, method) {
  return (
    method.toLowerCase() +
    url
      .replace(/^\/api/, "")
      .split(/[/:*]/)
      .filter(Boolean)
      .map((s) => s.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).map(cap).join(""))
      .join("") +
    "Route"
  );
}
function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function importAlias(mod, idx) {
  return `R${idx}`;
}

const byGroup = new Map();
manifest.forEach((entry, idx) => {
  const group = GROUPS.find((g) => g.match(entry.path));
  if (!byGroup.has(group.file)) byGroup.set(group.file, { group, entries: [] });
  byGroup.get(group.file).entries.push({ ...entry, idx });
});

mkdirSync(join(BACKEND, "src/controllers"), { recursive: true });

const written = new Set();
for (const [, { group, entries }] of byGroup) {
  const imports = entries
    .map((e) => `import * as ${importAlias(e.module, e.idx)} from "${e.module}";`)
    .join("\n");

  const methods = entries
    .flatMap((e) =>
      e.methods.map((m) => {
        const alias = importAlias(e.module, e.idx);
        return `
  @${METHOD_DECORATOR[m]}("${e.url}")
  async ${methodName(e.url, m)}(@Req() req: Request, @Res() res: Response) {
    await runRoute(req, res, (r, c) => ${alias}.${m}(r as never, c as never));
  }`;
      }),
    )
    .join("\n");

  const code = `/** خودکار — ${GENERATED_MARK}. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
${imports}

@Controller()
export class ${group.cls} {
${methods}
}
`;
  const file = join(BACKEND, `src/controllers/${group.file}.controller.ts`);
  writeFileSync(file, code, "utf8");
  written.add(file);
  console.log(`${group.cls}: ${entries.length} مسیر`);
}

/**
 * ME-10: اگر همهٔ مسیرهای یک گروه از مانیفست بروند، فایل تولیدشدهٔ آن باقی
 * می‌ماند و همان routeها را دوباره ثبت می‌کند. فایل‌های دارای علامتِ «خودکار»
 * که در این دور تولید نشده‌اند بی‌یتیم‌اند؛ پیش‌فرض فقط گزارش می‌شوند چون
 * حذفشان یعنی import در app.module.ts هم می‌شکند.
 */
function listControllers(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) listControllers(p, acc);
    else if (e.name.endsWith(".controller.ts")) acc.push(p);
  }
  return acc;
}

const controllersDir = join(BACKEND, "src/controllers");
const orphans = listControllers(controllersDir).filter(
  (p) => !written.has(p) && readFileSync(p, "utf8").includes(GENERATED_MARK),
);
for (const p of orphans) {
  const rel = relative(BACKEND, p).split("\\").join("/");
  if (PRUNE) {
    rmSync(p, { force: true });
    console.log(`🗑  کنترلر بی‌یتیم حذف شد: ${rel} — import آن را از src/app.module.ts هم بردارید`);
  } else {
    console.warn(`⚠️  کنترلر بی‌یتیم: ${rel} هیچ مسیری در مانیفست ندارد (با --prune حذف شود)`)
  }
}

// CronJobsService — اجرای jobها با @nestjs/schedule
const cronEntries = manifest.filter((m) => m.path.startsWith("cron/"));
const missingSchedule = cronEntries.filter((e) => !CRON_SCHEDULES[e.path]).map((e) => e.path);
const deadSchedules = Object.keys(CRON_SCHEDULES).filter((name) => !cronEntries.some((e) => e.path === name));
for (const name of missingSchedule) {
  console.error(`❌ کران «${name}» در مانیفست هست ولی ددلاین در CRON_SCHEDULES ندارد → هرگز اجرا نمی‌شود.`);
}
for (const name of deadSchedules) {
  console.error(`❌ ددلاین «${name}» در CRON_SCHEDULES هست ولی مسیری در مانیفست نیست → کران مرده.`);
}
if (missingSchedule.length || deadSchedules.length) process.exitCode = 1;

const cronMethods = cronEntries
  .filter((e) => CRON_SCHEDULES[e.path])
  .map(
    (e) => `  @Cron(${JSON.stringify(CRON_SCHEDULES[e.path])})
  async ${e.path.replace(/^cron\//, "cron_").replace(/[^A-Za-z0-9_]/g, "_")}() {
    await this.fire(${JSON.stringify(e.path)});
  }`,
  )
  .join("\n\n");

const cronCode = `/**
 * کران‌های داخلی (با @nestjs/schedule) — زمان‌بندی در CRON_SCHEDULES داخل
 * backend/scripts/gen-controllers.mjs تعریف شده و از همان‌جا تولید می‌شود.
 * هندلرها همان routeهای /api/cron/* هستند که با هدر CRON_SECRET صدا زده می‌شوند
 * تا مسیر HTTP کران هم برای اسکریپت‌های موجود (automate.cjs) سالم بماند.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
${cronEntries.map((e, i) => `import * as C${i} from "${e.module}";`).join("\n")}

const CRON_JOBS: { name: string; url: string; mod: { GET: (req: Request, ctx: unknown) => Promise<Response> } }[] = [
${cronEntries.map((e, i) => `  { name: "${e.path}", url: "http://internal${e.url}", mod: C${i} as never },`).join("\n")}
];

@Injectable()
export class CronJobsService {
  private readonly log = new Logger("cron");

${cronMethods}

  private async fire(name: string) {
    const job = CRON_JOBS.find((j) => j.name === name);
    if (!job) {
      this.log.error(\`کران \${name} در CRON_JOBS نیست — «npm run gen:controllers» را اجرا کنید\`);
      return;
    }
    const secret = process.env.CRON_SECRET ?? "";
    if (!secret) {
      this.log.warn("CRON_SECRET تنظیم نشده — کران اجرا نشد");
      return;
    }
    const request = new Request(job.url, { headers: { authorization: \`Bearer \${secret}\` } });
    try {
      const res = await job.mod.GET(request, { params: {} });
      if (res.status >= 400) this.log.error(\`\${name} → HTTP \${res.status}: \${await res.text()}\`);
      else this.log.log(\`\${name} ok\`);
    } catch (err) {
      this.log.error(\`\${name} failed\`, err as Error);
    }
  }
}
`;
mkdirSync(join(BACKEND, "src/cron"), { recursive: true });
writeFileSync(join(BACKEND, "src/cron/cron-jobs.service.ts"), cronCode, "utf8");
console.log(`CronJobsService تولید شد (${cronMethods.split("@Cron(").length - 1} کران)`);
