// کنسول عملیات — دم فایل لاگ سرویس (PM2 یا OPS_CONSOLE_LOG_FILE)
import { json } from "@/lib/utils";
import { isAllowedLogPath, opsGate, resolveLogFile, tailLines } from "@/lib/ops-console";

export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const g = await opsGate(req);
  if (g instanceof Response) return g;

  const url = new URL(req.url);
  const rawLines = url.searchParams.get("lines") ?? "100";
  let lines = 100;
  if (/^\d{1,3}$/.test(rawLines)) {
    lines = Math.min(500, Math.max(10, Number(rawLines)));
  }

  const file = resolveLogFile();
  if (!file.found) {
    return json({
      success: true,
      found: false,
      path: file.path,
      hint: "فایل لاگ پیدا نشد. اگر مسیر لاگ سرویس با پیش‌فرض فرق دارد، OPS_CONSOLE_LOG_FILE را در .env بدهید (مثلاً /root/.pm2/logs/nobino-api-out.log) و سرویس را ری‌استارت کنید.",
    });
  }
  if (!isAllowedLogPath(file.path)) {
    return json({ success: false, error: "مسیر لاگ خارج از پوشه‌های مجاز است (ریشهٔ پروژه، لاگ‌های PM2 یا /var/log)." }, { status: 400 });
  }
  return json({ success: true, found: true, path: file.path, lines: tailLines(file.path, lines) });
}
