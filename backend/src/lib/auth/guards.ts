import { cookies } from "@/compat/next-headers";
import { prisma } from "@/lib/prisma";
import { verifyToken, JwtPayload } from "@/lib/auth/jwt";
import { httpError } from "@/lib/utils";

export const AUTH_COOKIE = "nobino_token";

/**
 * دریافت کاربر جاری با بررسی نشست فعال. اگر نشست منقضی/ابطال شده باشد،
 * توکن معتبر هم پذیرفته نمی‌شود.
 */
export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // نشست باید دقیقاً با همین توکن مطابقت داشته باشد؛ در غیر این صورت توکن
  // یا ابطال شده است یا هرگز ثبت نشده و نباید پذیرفته شود.
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.session.findFirst({
    where: { userId: payload.sub, tokenHash, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!session) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) return null;
  return user;
}

/** نیازمند ورود موفق؛ در غیر این صورت null */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw httpError("Authentication required", 401);
  return user;
}

/** یاریاب دسترسی بر اساس نقش (برای Route Handlerها — خطا پرتاب می‌کند) */
export async function requireRole(roles: JwtPayload["role"][]) {
  const user = await requireAuth();
  if (!roles.includes(user.role)) throw httpError("Forbidden", 403);
  return user;
}

/**
 * بررسی دسترسی مدیریتی به یک سالن: مالک سالن یا ADMIN کل پلتفرم.
 * جلوگیری از دسترسی متقاطع بین سالن‌های مختلف (tenant isolation).
 */
export async function requireSalonManage(salonId: string) {
  const user = await requireRole(["SALON_OWNER", "ADMIN"]);
  const salon = await prisma.salon.findUnique({ where: { id: salonId }, select: { id: true, ownerId: true } });
  if (!salon) throw httpError("Salon not found", 404);
  if (user.role !== "ADMIN" && salon.ownerId !== user.id) throw httpError("Forbidden for this salon", 403);
  return user;
}
