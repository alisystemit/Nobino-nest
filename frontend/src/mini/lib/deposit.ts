import { mapi } from "./store";

/**
 * شروع پرداخت بیعانهٔ نوبت.
 * در موفقیت، آدرس درگاه (sandbox یا واقعی) برمی‌گردد و کاربر باید به همان آدرس هدایت شود؛
 * پس از پرداخت، درگاه به callback برمی‌گردد و وضعیت «بیعانه پرداخت شد» روی نوبت می‌نشیند.
 */
export async function startDepositPayment(
  appointmentId: string
): Promise<{ ok: boolean; error?: string; redirectUrl?: string }> {
  const res = await mapi<{ success: boolean; error?: string; redirectUrl?: string }>(
    "/api/payments/create",
    { method: "POST", body: JSON.stringify({ appointmentId }) }
  );
  if (!res.ok || !res.data?.redirectUrl) {
    return { ok: false, error: res.data?.error ?? "شروع پرداخت ممکن نشد" };
  }
  return { ok: true, redirectUrl: res.data.redirectUrl };
}
