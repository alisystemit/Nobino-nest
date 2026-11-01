import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه PSP / پی‌اس‌پی
 */
export class PspGateway extends BaseGateway {
  readonly id = "psp";
  readonly name = "پی‌اس‌پی";
  readonly sandbox = isSandbox(env.PSP_SANDBOX);

  private base = "https://psp.ir/api/v1";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const res = await fetch(`${this.base}/payment/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": await this.cred("api_key", env.PSP_API_KEY) },
      body: JSON.stringify({
        merchant: await this.cred("merchant_id", env.PSP_MERCHANT_ID),
        amount: order.amount * 10,
        callback: order.callbackUrl,
        description: order.description,
        order_id: order.id,
      }),
    });
    const data = await res.json();
    if (data.token) {
      return { success: true, authority: data.token, redirectUrl: `${this.base}/gateway/${data.token}` };
    }
    return { success: false, message: data.message ?? "خطای PSP" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const res = await fetch(`${this.base}/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": await this.cred("api_key", env.PSP_API_KEY) },
      body: JSON.stringify({ token: opts.authority ?? opts.params.token ?? "" }),
    });
    const data = await res.json();
    if (data.status === "OK" || data.success) {
      return { success: true, refId: data.ref_id ?? data.track_id ?? "" };
    }
    return { success: false, message: data.message ?? "تراکنش ناموفق" };
  }
}
