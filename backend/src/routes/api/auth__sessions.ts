// خودکار: پورت‌شده از src/app/api/auth/sessions/route.ts — بدون تغییر منطق


import { cookies } from "@/compat/next-headers";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";

import { AUTH_COOKIE } from "@/lib/auth/guards";
import { json, apiError, getPagination } from "@/lib/utils";
import { createHash } from "node:crypto";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const { page, limit, skip, take } = getPagination(_req.url, 20, 100);
    const where = { userId: user.id, expiresAt: { gt: new Date() } };
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        select: { id: true, device: true, ip: true, createdAt: true, expiresAt: true },
        skip,
        take,
      }),
      prisma.session.count({ where }),
    ]);
    return json({ success: true, sessions, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ success: false, error: "id is required" }, { status: 400 });

    const session = await prisma.session.findUnique({ where: { id } });
    if (!session || session.userId !== user.id) {
      return json({ success: false, error: "session not found" }, { status: 404 });
    }
    await prisma.session.delete({ where: { id } });

    // اگر نشست فعلی حذف شد، کوکی را نیز پاک کن
    const store = await cookies();
    const token = store.get(AUTH_COOKIE)?.value;
    if (token) {
      const hash = createHash("sha256").update(token).digest("hex");
      if (hash === session.tokenHash) store.delete(AUTH_COOKIE);
    }

    return json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
