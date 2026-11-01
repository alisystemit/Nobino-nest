import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env } from "@/lib/env";

/**
 * درگاه آیدی‌پی (IDPay)
 */
export class IdPayGateway extends BaseGateway {
  readonly id = "idpay";
  readonly name = "آیدی‌پی";
  readonly sandbox = true;
  callbackMethod(): "GET" | "POST" {
    return "POST";
  }

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const res = await fetch("https://api.idpay.ir/v1.1/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": await this.cred("api_key", env.IDPAY_API_KEY || env.PSP_API_KEY),
        "X-SANDBOX": "1",
      },
      body: JSON.stringify({
        order_id: order.id,
        amount: order.amount * 10,
        callback: order.callbackUrl,
        name: order.customer?.name ?? "",
        phone: order.customer?.phone ?? "",
        desc: order.description,
      }),
    });
    const data = await res.json();
    if (data.error_code === 0 && data.id) {
      return { success: true, authority: data.id, redirectUrl: data.link ?? `https://idpay.ir/${data.id}` };
    }
    return { success: false, message: data.error_message ?? "خطای آیدی‌پی" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const id = opts.params.id ?? opts.authority ?? "";
    const res = await fetch("https://api.idpay.ir/v1.1/payment/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": await this.cred("api_key", env.IDPAY_API_KEY || env.PSP_API_KEY),
        "X-SANDBOX": "1",
      },
      body: JSON.stringify({ id, order_id: opts.order.id }),
    });
    const data = await res.json();
    if (data.status === 100) {
      return { success: true, refId: data.track_id, cardPan: data.payment?.card_no };
    }
    return { success: false, message: data.error_message ?? "تراکنش ناموفق" };
  }
}
