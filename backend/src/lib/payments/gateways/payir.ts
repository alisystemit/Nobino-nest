import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env } from "@/lib/env";

/**
 * درگاه Pay.ir
 */
export class PayIrGateway extends BaseGateway {
  readonly id = "payir";
  readonly name = "پی‌آی‌آر";
  readonly sandbox = true;
  callbackMethod(): "GET" | "POST" {
    return "POST";
  }

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const res = await fetch("https://pay.ir/pg/v2/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api: await this.cred("api_key", env.PAYIR_API_KEY || env.PSP_API_KEY),
        amount: order.amount * 10,
        redirect: order.callbackUrl,
        factorNumber: order.id,
        description: order.description,
      }),
    });
    const data = await res.json();
    if (data.status === 1 && data.token) {
      return { success: true, authority: data.token, redirectUrl: `https://pay.ir/pg/${data.token}` };
    }
    return { success: false, message: data.message ?? "خطای Pay.ir" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const token = opts.params.token ?? opts.authority ?? "";
    const res = await fetch("https://pay.ir/pg/v2/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api: await this.cred("api_key", env.PAYIR_API_KEY || env.PSP_API_KEY), token }),
    });
    const data = await res.json();
    if (data.status === 1) {
      return { success: true, refId: data.transId?.toString(), cardPan: data.cardNumber };
    }
    return { success: false, message: data.message ?? "تراکنش ناموفق" };
  }
}
