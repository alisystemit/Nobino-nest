/**
 * تولید controllerهای Nest از manifest پورت‌شده.
 * اجرا بعد از port-routes.mjs:  node backend/scripts/gen-controllers.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BACKEND = join(import.meta.dirname, "..");
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

  const code = `/** خودکار — تولیدشده توسط backend/scripts/gen-controllers.mjs. ویرایش دستی نکنید. */
import { Controller, Delete, Get, Patch, Post, Put, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { runRoute } from "@/common/run-route";
${imports}

@Controller()
export class ${group.cls} {
${methods}
}
`;
  writeFileSync(join(BACKEND, `src/controllers/${group.file}.controller.ts`), code, "utf8");
  console.log(`${group.cls}: ${entries.length} مسیر`);
}

// CronJobsService — اجرای same jobها با @nestjs/schedule (بدون Vercel Cron)
const cronEntries = manifest.filter((m) => m.path.startsWith("cron/"));
const cronCode = `/**
 * کران‌های داخلی معادل vercel.json (با @nestjs/schedule):
 *   reminders هر ساعت | notifications هر ۵ دقیقه | waitlist دقیقه ۱۵
 *   holds هر ۱۰ دقیقه | subscriptions ساعت 02:00
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

  @Cron("0 * * * *")
  async reminders() {
    await this.fire("cron/reminders");
  }

  @Cron("*/5 * * * *")
  async notifications() {
    await this.fire("cron/notifications");
  }

  @Cron("15 * * * *")
  async waitlist() {
    await this.fire("cron/waitlist");
  }

  @Cron("*/10 * * * *")
  async holds() {
    await this.fire("cron/holds");
  }

  @Cron("0 2 * * *")
  async subscriptions() {
    await this.fire("cron/subscriptions");
  }

  private async fire(name: string) {
    const job = CRON_JOBS.find((j) => j.name === name);
    if (!job) return;
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
writeFileSync(join(BACKEND, "src/cron/cron-jobs.service.ts"), (() => {
  mkdirSync(join(BACKEND, "src/cron"), { recursive: true });
  return cronCode;
})(), "utf8");
console.log("CronJobsService تولید شد");
