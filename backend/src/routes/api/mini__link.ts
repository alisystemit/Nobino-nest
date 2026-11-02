/**
 * اتصال حساب پیام‌رسان به حساب نوبینو — `POST /api/mini/link`
 *
 * بعد از یک ورود موفق (OTP یا رمز) از داخل وب‌ویو صدا زده می‌شود تا دفعهٔ بعد
 * کاربر بدون وارد کردن شماره، بی‌حس وارد شود. امضای `initData` دوباره و سمت
 * سرور راستی‌آزمایی می‌شود؛ مقدار ارسالی کلاینت هرگز ملاک هویت نیست.
 */
import { z } from "zod";
import { json, apiError } from "@/lib/utils";
import { requireAuth } from "@/lib/auth/guards";
import { publicUser } from "@/lib/auth/session";
import { platformEnabled, platformToken, readMiniConfig } from "@/lib/mini/config";
import { verifyWebAppInitData } from "@/lib/mini/webapp-data";
import { linkMessengerUser } from "@/lib/mini/links";

const schema = z.object({
  platform: z.string().min(2).max(20),
  initData: z.string().min(10).max(20000),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = schema.parse(await req.json());
    const platform = body.platform.trim().toLowerCase();

    if (!(await platformEnabled(platform))) {
      return json({ success: false, error: "این پیام‌رسان در پنل غیرفعال است", code: "PLATFORM_DISABLED" }, { status: 403 });
    }

    const cfg = await readMiniConfig();
    const def = cfg.platforms.find((p) => p.id === platform);
    if (!def?.signedInitData) {
      return json({ success: false, error: "این پیام‌رسان اتصال حساب را پشتیبانی نمی‌کند", code: "UNSUPPORTED" }, { status: 400 });
    }

    const token = await platformToken(platform);
    if (!token) {
      return json({ success: false, error: "توکن ربات در پنل تنظیم نشده است", code: "BOT_TOKEN_MISSING" }, { status: 400 });
    }

    const check = verifyWebAppInitData(body.initData, token);
    if (!check.ok) {
      return json({ success: false, error: "دادهٔ ورودی پیام‌رسان معتبر نیست", code: check.reason }, { status: 401 });
    }

    await linkMessengerUser({
      platform,
      externalId: check.profile.externalId,
      userId: user.id,
      username: check.profile.username,
      name: check.profile.name,
    });

    return json({ success: true, linked: true, platform, user: publicUser(user) });
  } catch (err) {
    return apiError(err);
  }
}
