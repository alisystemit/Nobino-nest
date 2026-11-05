/**
 * دانلود فایل بکاپ (فقط سوپرادمین).
 * پاسخ‌ها در همین مخزن با `arrayBuffer()` بافر می‌شوند (`common/run-route.ts`)،
 * پس سقف حجم گذاشته‌ایم تا دانلود از پنل حافظهٔ سرور را نخورد؛ بکاپ‌های
 * بزرگ‌تر از مسیر مستقیم سرور (scp) برداشته می‌شوند.
 */
import { readFileSync } from "node:fs";
import { requireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { apiError, json } from "@/lib/utils";
import { backupFilePath } from "@/lib/db-backup";

/** ۲۰۰ مگابایت — بالاتر از آن پیام «از روی سرور بردارید» */
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export async function GET(_req: Request, { params }: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { abs, name, bytes } = backupFilePath(params.name ?? "");
    if (bytes > MAX_DOWNLOAD_BYTES) {
      return json(
        {
          success: false,
          error: "حجم این بکاپ برای دانلود از پنل زیاد است؛ از پوشهٔ backups روی خودِ سرور بردارید.",
        },
        { status: 413 },
      );
    }
    await logAudit({ actorId: user.id, action: "db.backup.download", entityType: "Database", entityId: name, after: { bytes } });
    const body = readFileSync(abs);
    return new Response(body as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/octet-stream",
        // نام فایل از الگوی سخت BACKUP_NAME_RE عبور کرده، برای همین در هدر امن است
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
