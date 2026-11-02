// خودکار: پورت‌شده از src/app/api/auth/me/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAuth, resolveToken } from "@/lib/auth/guards";
import { dashboardStyleForUser, type DashboardStyle } from "@/lib/dashboard-style";
import { json, apiError } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  // نبودِ نشست (بازدیدکنندهٔ مهمان صفحهٔ عمومی سالن) خطا نیست؛ پاسخ 200 با user:null
  // تا پروبِ «من کیستم؟» در کنسول مرورگر خطای 401 تولید نکند.
  const token = await resolveToken();
  const user = await getCurrentUser();
  if (!user) {
    // توکن فرستاده شده ولی معتبر نیست (منقضی/باطل) → همان 401 مستندِ docs/mobile-api.md
    if (token) return json({ success: false, user: null }, { status: 401 });
    return json({ success: true, user: null });
  }
  // سبک داشبوردی که این کاربر باید ببیند («web» کلاسیک یا «mini» به‌سبک مینی‌اپ)
  // را سوپرادمین در پنل تنظیم می‌کند. خطای خواندن هرگز نباید «من کیستم» را بشکند،
  // پس پیش‌فرض امن همان نسخهٔ کلاسیک است.
  let dashboardStyle: DashboardStyle = "web";
  try {
    dashboardStyle = await dashboardStyleForUser(user);
  } catch {
    /* تنظیم نخوانده شد → کلاسیک */
  }
  return json({
    success: true,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
      email: user.email,
      avatarUrl: user.avatarUrl,
      dashboardStyle,
    },
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().optional(),
  // آواتار می‌تواند URL مطلق (Vercel Blob) یا مسیر نسبی (فایل محلی) باشد
  avatarUrl: z
    .string()
    .trim()
    .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), "آدرس تصویر نامعتبر است")
    .optional(),
});

/** ویرایش پروفایل کاربر جاری */
export async function PATCH(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const body = patchSchema.parse(await req.json());

    if (body.email && body.email.toLowerCase() !== user.email?.toLowerCase()) {
      const taken = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, select: { id: true } });
      if (taken && taken.id !== user.id) {
        return json({ success: false, error: "این ایمیل قبلاً ثبت شده است" }, { status: 409 });
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: body.name,
        email: body.email ? body.email.toLowerCase() : undefined,
        avatarUrl: body.avatarUrl,
      },
      select: { id: true, phone: true, name: true, email: true, avatarUrl: true, role: true },
    });

    return json({ success: true, user: updated });
  } catch (err) {
    return apiError(err);
  }
}

