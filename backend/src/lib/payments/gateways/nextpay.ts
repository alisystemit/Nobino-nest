import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه نکست‌پی (NextPay)
 */
export class NextPayGateway extends BaseGateway {
  readonly id = "nextpay";
  readonly name = "نکست‌پی";
  readonly sandbox = isSandbox(env.NEXTPAY_SANDBOX);

  private base = "https://api.nextpay.org";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const res = await fetch(`${this.base}/payment/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: await this.cred("api_key", env.NEXTPAY_API_KEY),
        merchant: await this.cred("merchant_id", env.NEXTPAY_MERCHANT_ID),
        amount: order.amount * 10,
        callback_uri: order.callbackUrl,
        description: order.description,
        order_id: order.id,
        customer_phone: order.customer?.phone ?? "",
      }),
    });
    const data = await res.json();
    if (data.trans_id) {
      return { success: true, authority: data.trans_id, redirectUrl: `https://nextpay.org/nx/gateway/payment/${data.trans_id}` };
    }
    return { success: false, message: data.error_message ?? "خطای نکست‌پی" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const res = await fetch(`${this.base}/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: await this.cred("api_key", env.NEXTPAY_API_KEY),
        trans_id: opts.params.trans_id ?? opts.authority ?? "",
        order_id: opts.order.id,
      }),
    });
    const data = await res.json();
    if (data.status === 0) {
      return { success: true, refId: data.shaparak_ref_id ?? data.trans_id ?? "" };
    }
    return { success: false, message: data.error_message ?? "تراکنش ناموفق" };
  }
}
