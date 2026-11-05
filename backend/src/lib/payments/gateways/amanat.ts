import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env } from "@/lib/env";

/**
 * درگاه آمانت (Amanat) — پاسارگاد
 */
export class AmanatGateway extends BaseGateway {
  readonly id = "amanat";
  readonly name = "آمانت";
  // قبلاً hard-code «true» بود؛ حالا فقط با تنظیم/متغیر sandbox روشن می‌شود
  readonly sandbox = false;

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const res = await fetch("https://amanat.ir/api/v1/payment/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: await this.cred("api_key", env.AMANAT_API_KEY || env.PSP_API_KEY),
        amount: order.amount * 10,
        callback_url: order.callbackUrl,
        description: order.description,
        order_id: order.id,
      }),
    });
    const data = await res.json();
    if (data.token) {
      return {
        success: true,
        authority: data.token,
        redirectUrl: `https://amanat.ir/api/v1/payment/gateway/${data.token}`,
      };
    }
    return { success: false, message: data.message ?? "خطای آمانت" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const res = await fetch("https://amanat.ir/api/v1/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: await this.cred("api_key", env.AMANAT_API_KEY || env.PSP_API_KEY), token: opts.authority ?? opts.params.token ?? "" }),
    });
    const data = await res.json();
    if (data.status === "OK" || data.success) {
      return { success: true, refId: data.ref_id ?? data.token ?? "" };
    }
    return { success: false, message: data.message ?? "تراکنش ناموفق" };
  }
}
