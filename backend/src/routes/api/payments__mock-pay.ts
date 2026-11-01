// خودکار: پورت‌شده از src/app/api/payments/mock-pay/route.ts — بدون تغییر منطق
import { simulateSandboxPay } from "@/lib/payments/engine";

/**
 * صفحه شبیه‌سازی پرداخت برای درگاه‌های سندباکس.
 * بعد از «پرداخت» تست، کاربر را به مسیر بازگشت درگاه هدایت می‌کند
 * تا چرخه کامل (request → redirect → callback → verify) تست شود.
 */
export async function GET(req: Request, _ctx: { params: Record<string, string> }) {
  const u = new URL(req.url);
  const order = u.searchParams.get("order") ?? "";
  const invoice = u.searchParams.get("invoice") ?? "";
  const authority = u.searchParams.get("authority") ?? "";
  const gateway = u.searchParams.get("gateway") ?? "sandbox";

  // در مد واقعی، اینجا می‌توانید صفحه پرداخت را نمایش دهید.
  // اینجا مستقیم به عنوان پرداخت موفق به callback می‌رویم.
  await simulateSandboxPay({ orderId: order || invoice, authority });

  const callback = `/api/payments/callback/${gateway}?order=${order}&invoice=${invoice}&authority=${authority}&Status=0&RefId=SB-REF-${Date.now()}&ResNum=${order || invoice}`;
  const origin = new URL(req.url).origin;
  return Response.redirect(new URL(callback, origin).toString());
}
