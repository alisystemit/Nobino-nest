// خودکار: پورت‌شده از src/app/api/auth/me/route.ts — بدون تغییر منطق


import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, requireAuth } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  const user = await getCurrentUser();
  if (!user) {
    return json({ success: false, user: null }, { status: 401 });
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

