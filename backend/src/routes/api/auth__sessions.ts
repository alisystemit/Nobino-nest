// خودکار: پورت‌شده از src/app/api/auth/sessions/route.ts — بدون تغییر منطق


import { cookies } from "@/compat/next-headers";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guards";

import { AUTH_COOKIE } from "@/lib/auth/guards";
import { json, apiError } from "@/lib/utils";
import { createHash } from "node:crypto";

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    const user = await requireAuth();
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, device: true, ip: true, createdAt: true, expiresAt: true },
    });
    return json({ success: true, sessions });
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
