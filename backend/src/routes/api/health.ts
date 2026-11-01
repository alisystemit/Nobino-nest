// خودکار: پورت‌شده از src/app/api/health/route.ts — بدون تغییر منطق
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { json, apiError } from "@/lib/utils";

/**
 * بازرسی سلامت برای PaaS (health check) و مانیتورینگ.
 * فقط وضعیت و «نوع» مشکل را برمی‌گرداند — هیچ رشتهٔ اتصال، host یا secret ای
 * در پاسخ نیست؛ این اطلاعات برای صفحهٔ خطا و تشخیص از راه دور استفاده می‌شود.
 */
export const instant = false;

/** نگاشت کد خطای Prisma به راهنمای فارسی (بدون جزئیات حساس) */
function explain(errCode: string, errMessage: string): { reason: string; hint: string } {
  if (!errCode.startsWith("P") && /can'?t reach|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(errMessage)) {
    return explain("P1001", "");
  }
  switch (errCode) {
    case "P1001":
      return { reason: "unreachable", hint: "سرور دیتابیس در دسترس نیست — DATABASE_URL (host/port) را در پنل PaaS چک کنید و سرویس را Restart کنید." };
    case "P1000":
      return { reason: "auth", hint: "نام کاربری یا رمز DATABASE_URL نادرست است." };
    case "P1003":
      return { reason: "no_database", hint: "پایگاه‌دادهٔ نام‌برده در سرور وجود ندارد — در پنل یک PostgreSQL بسازید." };
    case "P1010":
      return { reason: "forbidden", hint: "دسترسی IP کاربر رد شد — در پنل PaaS/IP allowlist بررسی کنید." };
    case "P1011":
      return { reason: "ssl", hint: "خطای پروتکل — احتمالاً باید `?sslmode=require` به انتهای DATABASE_URL اضافه کنید." };
    case "P1017":
      return { reason: "server_closed", hint: "سرور دیتابیس اتصال را بست — سرویس DB را Restart کنید." };
    default:
      return { reason: "error", hint: "اتصال دیتابیس برقرار نیست — مقدار DATABASE_URL را در پنل PaaS بررسی کنید." };
  }
}

export async function GET(_req: Request, _ctx: { params: Record<string, string> }) {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code) : "";
    const message = err instanceof Error ? err.message : "";
    const { reason, hint } = explain(code, message);
    return json({ ok: false, db: "down", reason, hint }, { status: 503 });
  }

  // اتصال برقرار است؛ حالا مطمئن شویم جدول‌ها ساخته شده‌اند (db push اجرا شده)
  try {
    await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
  } catch (err) {
    const notFound =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021";
    return json(
      {
        ok: false,
        db: "up",
        schema: notFound ? "missing" : "error",
        hint: notFound
          ? "جدول‌ها ساخته نشده‌اند — Start command را روی `npm run start:paas` بگذارید تا prisma db push خودکار اجرا شود."
          : "اتصال برقرار است اما بررسی جدول‌ها خطا داد.",
      },
      { status: 503 },
    );
  }

  return json({ ok: true, db: "up", schema: "ok" });
}
