// خودکار: پورت‌شده از src/app/api/auth/password/set/route.ts — بدون تغییر منطق
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";
import { hashPassword, verifyPassword, passwordIssue } from "@/lib/auth/password";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  password: z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد"),
  currentPassword: z.string().optional(),
});

/**
 * تنظیم یا تغییر رمز عبور کاربر جاری.
 * اگر رمزی از قبل تنظیم شده باشد، تأیید رمز فعلی الزامی است.
 */
export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = schema.parse(await req.json());

    const issue = passwordIssue(body.password);
    if (issue) return json({ success: false, error: issue }, { status: 400 });

    if (user.passwordHash) {
      if (!body.currentPassword) {
        return json(
          { success: false, error: "برای تغییر رمز عبور، رمز فعلی را وارد کنید." },
          { status: 400 }
        );
      }
      const ok = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!ok) {
        return json({ success: false, error: "رمز عبور فعلی صحیح نیست." }, { status: 400 });
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.password) },
    });

    return json({ success: true, message: "رمز عبور با موفقیت تنظیم شد." });
  } catch (err) {
    return apiError(err);
  }
}
