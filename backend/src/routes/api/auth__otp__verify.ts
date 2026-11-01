// خودکار: پورت‌شده از src/app/api/auth/otp/verify/route.ts — بدون تغییر منطق


import { z } from "zod";
import { cookies, headers } from "@/compat/next-headers";
import { createHash } from "node:crypto";
import { verifyOtp } from "@/lib/auth/otp";
import { signToken } from "@/lib/auth/jwt";
import { AUTH_COOKIE } from "@/lib/auth/guards";
import { authCookieSecure } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

const schema = z.object({
  phone: z.string().regex(/^0?9\d{9}$/),
  code: z.string().length(4),
});

export async function POST(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const body = schema.parse(await req.json());
    const phone = body.phone.startsWith("0") ? body.phone : `0${body.phone}`;

    const user = await verifyOtp(phone, body.code);

    // ورود ادمین با رمز عبور الزامی است (اگر رمزی تنظیم شده باشد)
    if (user.role === "ADMIN" && user.passwordHash) {
      return json({
        success: true,
        requiresPassword: true,
        login: user.email ?? user.phone,
      });
    }

    const token = await signToken({ sub: user.id, phone: user.phone, role: user.role });

    // O�U.U^O�UO U_U^O'O' O"O O_U^O�UO U_U^O'O' (U.O�O�UO O�U.O�U+U_OO�UO / IP / device)
    try {
      const hdrs = await headers();
      const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || null;
      const device = hdrs.get("user-agent") || null;
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          device,
          ip,
        },
      });
    } catch {
      // O�U.U^O�UO O_U^O�UO O�U.O�U+U_OO�UO U.O-OU?O,O� O_O�O3O�UO O3O�U^O� O�O U+U.OU,UO U+O'O_U�
    }

    const store = await cookies();
    store.set(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: await authCookieSecure(),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return json({
      success: true,
      token,
      user: { id: user.id, phone: user.phone, name: user.name, role: user.role },
    });
  } catch (err) {
    return apiError(err);
  }
}

