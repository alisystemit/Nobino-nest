import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه پرداخت‌نت (PardakhtNet)
 */
export class PardakhtNetGateway extends BaseGateway {
  readonly id = "pardakhtnet";
  readonly name = "پرداخت‌نت";
  readonly sandbox = isSandbox(env.PARDASHTNET_SANDBOX);

  private base = "https://pardakhtnet.com/api/v1";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const apiKey = await this.cred("api_key", env.PARDASHTNET_API_KEY);
    const res = await fetch(`${this.base}/payment/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        amount: order.amount * 10,
        callback_url: order.callbackUrl,
        description: order.description,
        order_id: order.id,
        mobile: order.customer?.phone ?? "",
      }),
    });
    const data = await res.json();
    if (data.token) {
      return { success: true, authority: data.token, redirectUrl: `${this.base}/payment/gateway/${data.token}` };
    }
    return { success: false, message: data.message ?? "خطای پرداخت‌نت" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const apiKey = await this.cred("api_key", env.PARDASHTNET_API_KEY);
    const res = await fetch(`${this.base}/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ token: opts.authority ?? opts.params.token ?? "" }),
    });
    const data = await res.json();
    if (data.status === "OK" || data.success) {
      return { success: true, refId: data.ref_id ?? data.trace_no ?? "" };
    }
    return { success: false, message: data.message ?? "تراکنش ناموفق" };
  }
}
