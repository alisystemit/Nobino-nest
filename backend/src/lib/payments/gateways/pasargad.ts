import { createHmac } from "node:crypto";
import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه پاسارگاد — شبکه پرداخت پی
 */
export class PasargadGateway extends BaseGateway {
  readonly id = "pasargad";
  readonly name = "پاسارگاد";
  readonly sandbox = isSandbox(env.PASARGAD_SANDBOX);

  private base = "https://pep.shaparak.ir";

  /**
   * کلید امضای درگاه — قبلاً به‌صورت ثابت در کد hard-code شده بود
   * (`A5C1A1502D4A4A9A`)؛ حالا از پنل (`payments.pasargad.sha_key`) یا
   * env `PASARGAD_SHA_KEY` خوانده می‌شود.
   */
  private signKey(): Promise<string> {
    return this.cred("sha_key", env.PASARGAD_SHA_KEY);
  }

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const invoiceDate = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
    const invoiceNumber = Date.now().toString();
    const amount = String(order.amount * 10);

    const terminalId = await this.cred("terminal_id", env.PASARGAD_TERMINAL_ID);
    const merchantCode = await this.cred("merchant_id", env.PASARGAD_USERNAME);
    const signPayload =
      terminalId + invoiceNumber + invoiceDate + amount + order.callbackUrl;
    const sign = createHmac("sha256", await this.signKey()).update(signPayload).digest("hex");

    const body = {
      invoiceNumber,
      invoiceDate,
      terminalCode: Number(terminalId),
      merchantCode,
      amount: Number(amount),
      redirectAddress: order.callbackUrl,
      action: 100,
      mobile: order.customer?.phone ?? "",
      sign,
    };

    const res = await fetch(`${this.base}/api/v2/payment/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.resultCode === 0 && data.token) {
      return {
        success: true,
        authority: data.token,
        redirectUrl: `${this.base}/api/v2/payment/gateway?token=${data.token}`,
        referenceId: invoiceNumber,
      };
    }
    return { success: false, message: data.message ?? "خطای پاسارگاد" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    // در پاسارگاد پس از بازگشت باید با invoiceNumber/invoiceDate/amount verify بزنیم
    const invoiceNumber = opts.params.iN ?? opts.params.invoiceNumber ?? "";
    const invoiceDate = opts.params.iD ?? opts.params.invoiceDate ?? "";
    const amount = String(opts.order.amount * 10);
    const terminalId = await this.cred("terminal_id", env.PASARGAD_TERMINAL_ID);
    const merchantCode = await this.cred("merchant_id", env.PASARGAD_USERNAME);
    const signPayload =
      terminalId + invoiceNumber + invoiceDate + amount + "0";
    const sign = createHmac("sha256", await this.signKey()).update(signPayload).digest("hex");

    const res = await fetch(`${this.base}/api/v2/payment/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceNumber,
        invoiceDate,
        terminalCode: Number(terminalId),
        merchantCode,
        amount: Number(amount),
        sign,
      }),
    });
    const data = await res.json();
    if (data.resultCode === 0) {
      return { success: true, refId: data.transactionReferenceId ?? invoiceNumber };
    }
    return { success: false, message: data.message ?? "تراکنش ناموفق" };
  }
}
