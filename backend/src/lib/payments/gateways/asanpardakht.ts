import { createHmac } from "node:crypto";
import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه آسان‌پرداخت (AsanPardakht)
 */
export class AsanPardakhtGateway extends BaseGateway {
  readonly id = "asanpardakht";
  readonly name = "آسان‌پرداخت";
  readonly sandbox = isSandbox(env.ASANPARDASHT_SANDBOX);

  private base = "https://ipg.asanpardakht.ir/api/v1";
  private gateway = "https://ipg.asanpardakht.ir/Pages/Public/Payment.aspx";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const invoiceNumber = Date.now().toString();
    const merchantId = await this.cred("merchant_id", env.ASANPARDASHT_MERCHANT_ID);
    const pin1 = await this.cred("pin1", env.ASANPARDASHT_PIN1);
    const pin2 = await this.cred("pin2", env.ASANPARDASHT_PIN2);
    const body: Record<string, string | number> = {
      merchantId,
      amount: order.amount * 10, // ریال
      callbackURL: order.callbackUrl,
      invoiceNumber,
      paymentId: order.id,
    };
    // آسان‌پرداخت با Pin1 (احراز) و Pin2 (امضای Serialize) کار می‌کند
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (pin1) {
      headers.Authorization = "Basic " + Buffer.from(`${merchantId}:${pin1}`).toString("base64");
      body.username = merchantId;
      body.password = pin1;
    }
    if (pin2) {
      body.serialize = createHmac("sha256", pin2).update(`${invoiceNumber},${body.amount},${merchantId}`).digest("hex");
    }
    const res = await fetch(`${this.base}/token`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.status === "SUCCESS" || data.token) {
      return {
        success: true,
        authority: data.token,
        redirectUrl: `${this.gateway}?Token=${data.token}`,
        referenceId: invoiceNumber,
      };
    }
    return { success: false, message: data.errorDescription ?? "خطای آسان‌پرداخت" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const merchantId = await this.cred("merchant_id", env.ASANPARDASHT_MERCHANT_ID);
    const pin1 = await this.cred("pin1", env.ASANPARDASHT_PIN1);
    const pin2 = await this.cred("pin2", env.ASANPARDASHT_PIN2);
    const invoiceNumber = opts.params.invoiceNumber ?? "";
    const amount = opts.order.amount * 10;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (pin1) headers.Authorization = "Basic " + Buffer.from(`${merchantId}:${pin1}`).toString("base64");
    const body: Record<string, string | number> = { merchantId, amount, invoiceNumber };
    if (pin2) body.serialize = createHmac("sha256", pin2).update(`${invoiceNumber},${amount},${merchantId}`).digest("hex");
    const res = await fetch(`${this.base}/Verify`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.status === "SUCCESS" || data.verifyResult === 0) {
      return { success: true, refId: data.verifyResult?.toString() ?? data.invoiceNumber, amount: opts.order.amount };
    }
    return { success: false, message: data.errorDescription ?? "تراکنش ناموفق" };
  }
}
