// کنسول عملیات — وضعیت سرور (فقط‌خواندنی، فقط سوپرادمین، پشت سوییچ و سقف نرخ)
import { hostname } from "node:os";
import { existsSync } from "node:fs";
import { json } from "@/lib/utils";
import { nodeEnv } from "@/lib/env";
import { dbPing, opsAppRoot, opsDeployLogPath, opsGate, readDeployLock, runCmd, tailLines } from "@/lib/ops-console";

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const g = await opsGate(req);
  if (g instanceof Response) return g;

  const out: Record<string, unknown> = {
    success: true,
    enabled: true,
    server: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      cwd: opsAppRoot(),
      hostname: hostname(),
      env: nodeEnv(),
    },
  };

  out.db = await dbPing();

  try {
    const [log, branch] = await Promise.all([
      runCmd("git", ["-C", opsAppRoot(), "log", "-1", "--format=%h %s"], 5000),
      runCmd("git", ["-C", opsAppRoot(), "rev-parse", "--abbrev-ref", "HEAD"], 5000),
    ]);
    out.git = { branch: branch.stdout.trim(), commit: log.stdout.trim() };
  } catch {
    out.git = { error: "git در دسترس نیست" };
  }

  try {
    const { stdout } = await runCmd("pm2", ["jlist"], 6000);
    const list = JSON.parse(stdout) as Record<string, unknown>[];
    out.pm2 = {
      available: true,
      list: list.map((p) => {
        const e = (p.pm2_env ?? {}) as Record<string, unknown>;
        return {
          name: typeof p.name === "string" ? p.name : "?",
          id: typeof e.pm_id === "number" ? e.pm_id : null,
          status: typeof e.status === "string" ? e.status : "?",
          restarts: typeof e.restarts === "number" ? e.restarts : 0,
          uptimeMs: typeof e.pm_uptime === "number" ? Math.max(0, Date.now() - (e.pm_uptime as number)) : null,
        };
      }),
    };
  } catch {
    out.pm2 = { available: false };
  }

  try {
    const { stdout } = await runCmd("df", ["-k", "-P", opsAppRoot()], 6000);
    const line = stdout.trim().split("\n").slice(-1)[0] ?? "";
    const cols = line.split(/\s+/).filter(Boolean);
    if (cols.length >= 6 && /^\d+$/.test(cols[1] ?? "")) {
      out.disk = {
        filesystem: cols[0],
        sizeKb: Number(cols[1]),
        usedKb: Number(cols[2]),
        availKb: Number(cols[3]),
        usePercent: cols[4]?.replace(/%$/, ""),
        mount: cols.slice(5).join(" "),
      };
    } else {
      out.disk = { error: "خروجی df قابل خواندن نبود" };
    }
  } catch {
    out.disk = { error: "df در دسترس نیست" };
  }

  const deployLog = opsDeployLogPath();
  const lock = readDeployLock();
  out.deploy = {
    running: lock.running,
    startedAt: lock.startedAt,
    pid: lock.pid,
    cmd: lock.cmd,
    tail: existsSync(deployLog) ? tailLines(deployLog, 20) : [],
  };

  return json(out);
}
