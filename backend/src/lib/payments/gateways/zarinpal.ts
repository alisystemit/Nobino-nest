import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه زرین‌پال (Zarinpal) — نسخه v4
 * مستندات: https://bit.ly/zarinpal-site
 */
export class ZarinpalGateway extends BaseGateway {
  readonly id = "zarinpal";
  readonly name = "زرین‌پال";
  readonly sandbox = isSandbox(env.ZARINPAL_SANDBOX);

  private base = "https://payment.zarinpal.com/pg/v4/payment";
  private startPay = "https://payment.zarinpal.com/pg/StartPay";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const res = await fetch(`${this.base}/request.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: await this.cred("merchant_id", env.ZARINPAL_MERCHANT_ID),
        amount: order.amount * 10, // به ریال
        description: order.description,
        callback_url: order.callbackUrl,
        metadata: { mobile: order.customer?.phone, email: "" },
      }),
    });
    const data = await res.json();
    if (data.data?.code === 100 && data.data.authority) {
      return {
        success: true,
        authority: data.data.authority,
        redirectUrl: `${this.startPay}/${data.data.authority}`,
      };
    }
    return { success: false, message: data.errors?.message ?? "خطای زرین‌پال" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const res = await fetch(`${this.base}/verify.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        merchant_id: await this.cred("merchant_id", env.ZARINPAL_MERCHANT_ID),
        amount: opts.order.amount * 10,
        authority: opts.authority,
      }),
    });
    const data = await res.json();
    if (data.data?.code === 100 && data.data.ref_id) {
      return { success: true, refId: String(data.data.ref_id), cardPan: data.data.card_pan };
    }
    return { success: false, message: data.errors?.message ?? "تراکنش ناموفق" };
  }
}
