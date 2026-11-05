/**
 * بازگردانی دیتابیس از یک بکاپ — ویران‌ترین عملیات پنل.
 *
 * سه لایهٔ محافظ:
 *  ۱) تأیید صریح: باید کلمهٔ `ROLLBACK` دقیقاً نوشته شود (همان قرارداد
 *     `deploy/update.sh`، پس اپراتور در هر دو مسیر یک عادت دارد).
 *  ۲) بازبینی رمز عبور ورودِ ادمین، اگر رمز تنظیم شده باشد — یعنی کوکی
 *     دزدیده‌شده به‌تنهایی دیتابیس را بازنویسی نمی‌کند.
 *  ۳) بکاپ ایمنی خودکار با برچسب «پیش از بازگردانی» پیش از هر تغییر؛ اگر
 *     بازگردانی خراب باشد، همان بکاپ از همان پنل برگردانده می‌شود.
 *
 * کار در پس‌زمینه اجرا می‌شود (202) و نتیجه/پیشرفت از `GET /api/admin/backups`
 * خوانده می‌شود. قفل درون‌فرایندی اجازهٔ دو بازگردانی هم‌زمان را نمی‌دهد.
 */
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { verifyPassword } from "@/lib/auth/password";
import { logAudit } from "@/lib/audit";
import { json, apiError } from "@/lib/utils";
import { checkRate, tooManyRequests } from "@/lib/rate-limit-lite";
import { backupFilePath, restoreBackup, safeFileLabel } from "@/lib/db-backup";

const schema = z.object({
  confirm: z.string(),
  password: z.string().optional(),
  /** پیش‌فرض true؛ false فقط وقتی خودتان بکاپ دیگری آماده دارید */
  snapshotFirst: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Record<string, string> }) {
  try {
    const user = await requireRole(["ADMIN"]);
    const name = params.name ?? "";
    // اعتبارسنجی نام/وجود فایل و خواندن بادی — تا خطاها synchronous برگردند
    const { bytes } = backupFilePath(name);
    const body = schema.parse(await req.json().catch(() => ({})));

    if (body.confirm.trim() !== "ROLLBACK") {
      return json({ success: false, error: "برای تأیید باید کلمهٔ ROLLBACK را دقیقاً بنویسید؛ دیتابیس بازنویسی می‌شود." }, { status: 400 });
    }

    if (user.passwordHash) {
      const rl = checkRate(`admin-backup-restore:${user.id}`, 5, 10 * 60 * 1000);
      if (!rl.ok) return tooManyRequests(rl.retryAfterSec, "تعداد تلاش‌های بازگردانی زیاد است؛ کمی بعد دوباره تلاش کنید.");
      const password = String(body.password ?? "");
      if (!password) return json({ success: false, error: "رمز عبور ورود خود را وارد کنید (تأیید دوم بازگردانی)." }, { status: 401 });
      if (!(await verifyPassword(password, user.passwordHash))) {
        return json({ success: false, error: "رمز عبور اشتباه است." }, { status: 401 });
      }
    }

    const actor = user.email ?? user.phone ?? user.id;
    void restoreBackup(name, { actor, snapshotFirst: body.snapshotFirst !== false })
      .then((result) =>
        logAudit({
          actorId: user.id,
          action: "db.backup.restore",
          entityType: "Database",
          entityId: name,
          before: { target: name, bytes },
          after: { engine: result.engine, snapshot: result.snapshot ?? null },
        }),
      )
      // شکست در jobHistory ثبت می‌شود و پنل آن را نشان می‌دهد
      .catch(() => undefined);

    return json(
      {
        success: true,
        started: true,
        target: safeFileLabel(name),
        message: "بازگردانی آغاز شد؛ پیشرفت را از همین صفحه ببینید. تا پایان، تغییرات را در پنل ذخیره نکنید.",
      },
      { status: 202 },
    );
  } catch (err) {
    return apiError(err);
  }
}
