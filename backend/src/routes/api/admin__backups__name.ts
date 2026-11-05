/**
 * حذف یک فایل بکاپ از دیسک (فقط سوپرادمین).
 * نام باید الگوی سخت بکاپ‌ها را پاس کند و درون پوشهٔ بکاپ بماند؛ با هر چیز
 * دیگر 400 می‌گیریم (نه 500 با مسیر فاش‌شده). حین عملیات دیگر 409 است.
 */
import { requireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { apiError, json } from "@/lib/utils";
import { deleteBackup } from "@/lib/db-backup";

export async function DELETE(_req: Request, { params }: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const name = params.name ?? "";
    const { removed } = deleteBackup(name);
    await logAudit({ actorId: user.id, action: "db.backup.delete", entityType: "Database", entityId: name, before: { removed } });
    return json({ success: true, removed });
  } catch (err) {
    return apiError(err);
  }
}
