/**
 * ورود بی‌حس مینی‌اپ — `POST /api/mini/session`
 *
 * کلاینت داخل وب‌ویو، رشتهٔ `initData` که پیام‌رسان تزریق کرده را می‌فرستد؛
 * سرور امضای آن را با توکن ربات (که هرگز به کلاینت نمی‌رود) راستی‌آزمایی می‌کند و
 * در صورت داشتن پیوند، نشست عادی نوبینو (کوکی + JWT) صادر می‌کند.
 *
 * پاسخ همیشه با ۲۰۰ برمی‌گردد تا کلاینت بتواند مسیر را خودش انتخاب کند:
 *  - `{ linked: true, token, user }` → کاربر شناخته شد
 *  - `{ needsPhone: true, profile }` → امضا معتبر است ولی حساب نوبینو وصل نیست
 *  - `{ mode: "otp" }` → ورود بی‌حس غیرفعال/پشتیبانی‌نشده (توکن تنظیم نشده یا پلتفرم فاقد امضا)
 *  - `{ success: false, code }` → امضا نامعتبر (کلاینت باید OTP را نشان دهد)
 */
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";
import { issueSession, publicUser } from "@/lib/auth/session";
import { readMiniConfig, platformEnabled, platformToken } from "@/lib/mini/config";
import { verifyWebAppInitData } from "@/lib/mini/webapp-data";
import { findLinkedUserId } from "@/lib/mini/links";

const schema = z.object({
  platform: z.string().min(2).max(20),
  initData: z.string().min(10).max(20000),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());
    const platform = body.platform.trim().toLowerCase();

    if (!(await platformEnabled(platform))) {
      return json({ success: false, error: "این پیام‌رسان در پنل غیرفعال است", code: "PLATFORM_DISABLED" }, { status: 403 });
    }

    const cfg = await readMiniConfig();
    const def = cfg.platforms.find((p) => p.id === platform);
    if (!def) return json({ success: false, error: "پلتفرم ناشناخته", code: "UNKNOWN_PLATFORM" }, { status: 400 });

    // پلتفرم‌هایی که امضای استاندارد نمی‌دهند (مثل وایتا) یا وقتی ورود بی‌حس خاموش است:
    // فقط حالت OTP را به کلاینت اعلام می‌کنیم.
    const token = await platformToken(platform);
    if (!cfg.features.silentLogin || !def.signedInitData || !token) {
      return json({ success: true, mode: "otp", user: null });
    }

    const check = verifyWebAppInitData(body.initData, token);
    if (!check.ok) {
      return json({ success: false, error: "دادهٔ ورودی پیام‌رسان معتبر نیست", code: check.reason }, { status: 401 });
    }

    const userId = await findLinkedUserId(platform, check.profile.externalId);
    if (!userId) {
      return json({
        success: true,
        needsPhone: true,
        profile: {
          name: check.profile.name ?? check.profile.username ?? "",
          username: check.profile.username ?? "",
          language: check.profile.language ?? "",
          photoUrl: check.profile.photoUrl ?? "",
        },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      return json({ success: true, needsPhone: true, reason: "ACCOUNT_INACTIVE" });
    }

    const sessionToken = await issueSession({ id: user.id, phone: user.phone, role: user.role });
    return json({ success: true, linked: true, token: sessionToken, user: publicUser(user) });
  } catch (err) {
    return apiError(err);
  }
}
