import { BaseGateway } from "@/lib/payments/gateways/base";
import { gwSign as sign } from "@/lib/payments/gateway-config";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه ونکی (Vanak) — بانک دی
 */
export class VanakGateway extends BaseGateway {
  readonly id = "vanak";
  readonly name = "ونکی (بانک دی)";
  readonly sandbox = isSandbox(env.VANAK_SANDBOX);

  private base = "https://vanak.ir/api/payment";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const body: Record<string, string | number> = {
      terminalId: await this.cred("terminal_id", env.VANAK_TERMINAL_ID),
      merchantId: await this.cred("merchant_id", env.VANAK_MERCHANT_ID),
      amount: order.amount * 10,
      callbackUrl: order.callbackUrl,
      invoiceNumber: order.id,
      description: order.description,
    };
    // ونکی (بانک دی) با نام‌کاربری/رمز امضا می‌شود؛ اگر از پنل وارد شوند اضافه می‌گردند
    const username = await this.cred("username", env.VANAK_USERNAME);
    const password = await this.cred("password", env.VANAK_PASSWORD);
    if (username) body.username = username;
    if (password) body.sign = sign(body, password);
    const res = await fetch(`${this.base}/request`, {
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
    return { success: false, message: data.message ?? "خطای ونکی" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const body: Record<string, string> = {
      terminalId: await this.cred("terminal_id", env.VANAK_TERMINAL_ID),
      merchantId: await this.cred("merchant_id", env.VANAK_MERCHANT_ID),
      token: opts.authority ?? opts.params.token ?? "",
    };
    const password = await this.cred("password", env.VANAK_PASSWORD);
    if (password) body.sign = sign(body, password);
    const res = await fetch(`${this.base}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.status === 0 || data.success) {
      return { success: true, refId: data.rrn ?? data.ref_id ?? "" };
    }
    return { success: false, message: data.message ?? "تراکنش ناموفق" };
  }
}
