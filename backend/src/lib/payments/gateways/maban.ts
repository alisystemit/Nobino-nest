import { BaseGateway } from "@/lib/payments/gateways/base";
import { gwSign as sign } from "@/lib/payments/gateway-config";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه مبناکارت (MabanCard)
 */
export class MabanGateway extends BaseGateway {
  readonly id = "maban";
  readonly name = "مبناکارت";
  readonly sandbox = isSandbox(env.MABNA_SANDBOX);

  private base = "https://maban.shaparak.ir";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const body: Record<string, string | number> = {
      terminalId: await this.cred("terminal_id", env.MABNA_TERMINAL_ID),
      merchantId: await this.cred("merchant_id", env.MABNA_MERCHANT_ID),
      amount: order.amount * 10,
      callbackUrl: order.callbackUrl,
      invoiceNumber: order.id,
      description: order.description,
    };
    const shaKey = await this.cred("sha_key", env.MABNA_SHA_KEY);
    if (shaKey) body.sign = sign(body, shaKey);
    const res = await fetch(`${this.base}/api/v1/payment/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.token || data.status === 0) {
      return {
        success: true,
        authority: data.token ?? String(data.status),
        redirectUrl: `${this.base}/gateway/${data.token ?? data.status}`,
      };
    }
    return { success: false, message: data.message ?? "خطای مبناکارت" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const body: Record<string, string> = {
      terminalId: await this.cred("terminal_id", env.MABNA_TERMINAL_ID),
      merchantId: await this.cred("merchant_id", env.MABNA_MERCHANT_ID),
      token: opts.authority ?? opts.params.token ?? "",
    };
    const shaKey = await this.cred("sha_key", env.MABNA_SHA_KEY);
    if (shaKey) body.sign = sign(body, shaKey);
    const res = await fetch(`${this.base}/api/v1/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.status === 0 || data.success) {
      return { success: true, refId: data.rrn ?? data.traceNo ?? "" };
    }
    return { success: false, message: data.message ?? "تراکنش ناموفق" };
  }
}
