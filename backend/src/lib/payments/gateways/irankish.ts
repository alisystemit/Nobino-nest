import { createHash } from "node:crypto";
import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه ایران‌کیش (IranKish) — نسخه v3
 */
export class IranKishGateway extends BaseGateway {
  readonly id = "irankish";
  readonly name = "ایران‌کیش";
  readonly sandbox = isSandbox(env.IRANKISH_SANDBOX);

  private base = "https://ikc.shaparak.ir/api/v3/payment";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const body: Record<string, string | number> = {
      terminalId: await this.cred("terminal_id", env.IRANKISH_TERMINAL_ID),
      merchantId: await this.cred("merchant_id", env.IRANKISH_MERCHANT_ID),
      amount: order.amount * 10, // ریال
      callbackUrl: order.callbackUrl,
      invoiceNumber: order.id,
      description: order.description,
      paymentId: Date.now().toString(),
    };
    // ایران‌کیش درخواست را با «SHA Key» امضا می‌کند؛ بدون کلید، امضا ارسال نمی‌شود
    const shaKey = await this.cred("sha_key", env.IRANKISH_SHA_KEY);
    if (shaKey) {
      body.hash = createHash("sha256")
        .update([body.terminalId, body.merchantId, body.amount, body.invoiceNumber, body.callbackUrl, body.paymentId, shaKey].join(","))
        .digest("hex");
    }
    const res = await fetch(`${this.base}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.result?.status === "100" || data.token) {
      return {
        success: true,
        authority: data.token,
        redirectUrl: `${this.base}/gateway/${data.token}`,
        referenceId: data.paymentId,
      };
    }
    return { success: false, message: data.result?.message ?? "خطای ایران‌کیش" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const body: Record<string, string | number> = {
      terminalId: await this.cred("terminal_id", env.IRANKISH_TERMINAL_ID),
      merchantId: await this.cred("merchant_id", env.IRANKISH_MERCHANT_ID),
      amount: opts.order.amount * 10,
      invoiceNumber: opts.order.id,
      paymentId: opts.params.paymentId ?? "",
    };
    const shaKey = await this.cred("sha_key", env.IRANKISH_SHA_KEY);
    if (shaKey) {
      body.hash = createHash("sha256")
        .update([body.terminalId, body.merchantId, body.amount, body.invoiceNumber, body.paymentId, shaKey].join(","))
        .digest("hex");
    }
    const res = await fetch(`${this.base}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.result?.status === "100" || data.responseCode === "0") {
      return { success: true, refId: opts.params.cardNumber ?? data.transactionId ?? opts.order.id };
    }
    return { success: false, message: data.result?.message ?? "تراکنش ناموفق" };
  }
}
