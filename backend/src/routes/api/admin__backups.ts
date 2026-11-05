/**
 * فهرست و وضعیت بکاپ‌های دیتابیس + ساخت بکاپ + تنظیماتش.
 *
 * پاسخ‌ها هیچ رازی ندارند: نه `DATABASE_URL` (فقط نام/میزبان/پورت و نشانی
 * ماسک‌شده)، نه مسیرهای داخلی کاربری، نه محتوای فایل‌ها.
 *
 * ساخت بکاپ در پس‌زمینه اجرا می‌شود و 202 برمی‌گرداند؛ پنل با همان `GET`
 * پیشرفت را از `busy.message` می‌خواند. اگر عملیات دیگری در جریان باشد
 * قفل درون‌فرایندیِ `lib/db-backup` پاسخ 409 می‌دهد (پنل دکمه را غیرفعال
 * نگه می‌دارد، ولی این پاسخ برای دو تب هم‌زمان لازم است).
 */
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { logAudit } from "@/lib/audit";
import { json, apiError } from "@/lib/utils";
import { backupStatus, createBackup, listBackups, setEnginePreference, setKeep } from "@/lib/db-backup";

/** فهرست بکاپ‌ها + وضعیت موتور و پوشه */
export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await requireRole(["ADMIN"]);
    const [status, backups] = await Promise.all([backupStatus(), listBackups()]);
    return json({ success: true, ...status, backups });
  } catch (err) {
    return apiError(err);
  }
}

const createSchema = z.object({
  label: z.string().max(90).optional(),
  engine: z.enum(["pg", "json"]).optional(),
});

/** آغاز بکاپ‌گیری (پس‌زمینه) */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = createSchema.parse(await req.json().catch(() => ({})));
    const actor = user.email ?? user.phone ?? user.id;
    const label = (body.label ?? "").trim().slice(0, 90);

    void createBackup({ label, actor, engine: body.engine })
      .then((entry) =>
        logAudit({
          actorId: user.id,
          action: "db.backup.create",
          entityType: "Database",
          entityId: entry.name,
          after: { engine: entry.engine, bytes: entry.bytes, rows: entry.rows, label },
        }),
      )
      // شکست در jobHistory ثبت می‌شود و پنل آن را نشان می‌دهد؛ اینجا فقط
      // جلوی «rejected promise بدون هندلر» را می‌گیریم.
      .catch(() => undefined);

    return json(
      { success: true, started: true, message: "بکاپ‌گیری آغاز شد؛ نتیجه در فهرست مشخص می‌شود." },
      { status: 202 },
    );
  } catch (err) {
    return apiError(err);
  }
}

const patchSchema = z.object({
  keep: z.number().int().min(1).max(200).optional(),
  engine: z.enum(["auto", "pg", "json"]).optional(),
});

/** تنظیمات: تعداد نگه‌داشتن و موتور (`auto` یعنی pg اگر روی سرور باشد) */
export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const body = patchSchema.parse(await req.json());
    if (body.keep) await setKeep(body.keep);
    if (body.engine) await setEnginePreference(body.engine);
    await logAudit({
      actorId: user.id,
      action: "db.backup.config",
      entityType: "Database",
      after: { keep: body.keep ?? null, engine: body.engine ?? null },
    });
    const [status, backups] = await Promise.all([backupStatus(), listBackups()]);
    return json({ success: true, ...status, backups });
  } catch (err) {
    return apiError(err);
  }
}
