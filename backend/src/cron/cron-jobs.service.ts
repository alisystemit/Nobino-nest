/**
 * کران‌های داخلی معادل vercel.json (با @nestjs/schedule):
 *   reminders هر ساعت | notifications هر ۵ دقیقه | waitlist دقیقه ۱۵
 *   holds هر ۱۰ دقیقه | subscriptions ساعت 02:00
 * هندلرها همان routeهای /api/cron/* هستند که با هدر CRON_SECRET صدا زده می‌شوند
 * تا مسیر HTTP کران هم برای اسکریپت‌های موجود (automate.cjs) سالم بماند.
 */
import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { cronSecret } from "@/lib/auth/cron-guard";
import * as C0 from "@/routes/api/cron__holds";
import * as C1 from "@/routes/api/cron__notifications";
import * as C2 from "@/routes/api/cron__reminders";
import * as C3 from "@/routes/api/cron__subscriptions";
import * as C4 from "@/routes/api/cron__waitlist";

const CRON_JOBS: { name: string; url: string; mod: { GET: (req: Request, ctx: unknown) => Promise<Response> } }[] = [
  { name: "cron/holds", url: "http://internal/api/cron/holds", mod: C0 as never },
  { name: "cron/notifications", url: "http://internal/api/cron/notifications", mod: C1 as never },
  { name: "cron/reminders", url: "http://internal/api/cron/reminders", mod: C2 as never },
  { name: "cron/subscriptions", url: "http://internal/api/cron/subscriptions", mod: C3 as never },
  { name: "cron/waitlist", url: "http://internal/api/cron/waitlist", mod: C4 as never },
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
    const secret = await cronSecret();
    if (!secret) {
      this.log.warn("CRON_SECRET تنظیم نشده — کران اجرا نشد");
      return;
    }
    const request = new Request(job.url, { headers: { authorization: `Bearer ${secret}` } });
    try {
      const res = await job.mod.GET(request, { params: {} });
      if (res.status >= 400) this.log.error(`${name} → HTTP ${res.status}: ${await res.text()}`);
      else this.log.log(`${name} ok`);
    } catch (err) {
      this.log.error(`${name} failed`, err as Error);
    }
  }
}
