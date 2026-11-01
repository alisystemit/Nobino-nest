import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env } from "@/lib/env";

/**
 * درگاه زیبال (Zibal)
 */
export class ZibalGateway extends BaseGateway {
  readonly id = "zibal";
  readonly name = "زیبال";
  readonly sandbox = true;

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const body: Record<string, string | number> = {
      merchant: (await this.cred("merchant_id", env.ZIBAL_MERCHANT_ID || env.PSP_MERCHANT_ID)) || "zibal",
      amount: order.amount * 10,
      callbackUrl: order.callbackUrl,
      description: order.description,
      orderId: order.id,
    };
    // زیبال علاوه بر merchant به کلید API هم نیاز دارد (payments.zibal.api_key)
    const apiKey = await this.cred("api_key", env.ZIBAL_API_KEY || env.PSP_API_KEY);
    if (apiKey) body.apiKey = apiKey;
    const res = await fetch("https://gateway.zibal.ir/v1/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.result === 100) {
      return { success: true, authority: data.trackId, redirectUrl: `https://gateway.zibal.ir/start/${data.trackId}` };
    }
    return { success: false, message: data.message ?? "خطای زیبال" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const trackId = opts.params.trackId ?? opts.authority ?? "";
    const res = await fetch("https://gateway.zibal.ir/v1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant: (await this.cred("merchant_id", env.PSP_MERCHANT_ID)) || "zibal", trackId }),
    });
    const data = await res.json();
    if (data.result === 100) {
      return { success: true, refId: trackId, amount: data.amount / 10 };
    }
    return { success: false, message: data.message ?? "تراکنش ناموفق" };
  }
}
