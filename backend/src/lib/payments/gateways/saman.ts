import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه سامان (Sepehr)
 */
export class SamanGateway extends BaseGateway {
  readonly id = "saman";
  readonly name = "سامان (سپهر)";
  readonly sandbox = isSandbox(env.SAMAN_SANDBOX);

  private tokenUrl = "https://sep.shaparak.ir/onlinepg/onlinepg";
  private sendTokenUrl = "https://sep.shaparak.ir/OnlinePG/SendToken";
  private verifyUrl = "https://verify.sep.ir/Payment/Verify";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const terminalId = await this.cred("terminal_id", env.SAMAN_TERMINAL_ID);
    const merchantId = await this.cred("merchant_id", env.SAMAN_MERCHANT_ID);
    const password = await this.cred("password", env.SAMAN_PASSWORD);
    const res = await fetch(this.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "token",
        TerminalId: terminalId,
        // درگاه سامان علاوه بر ترمینال، Merchant و Password هم لازم دارد؛
        // اگر از پنل وارد شده باشند به درخواست اضافه می‌شوند.
        ...(merchantId ? { Merchant: merchantId } : {}),
        ...(password ? { Password: password } : {}),
        Amount: order.amount * 10,
        ResNum: order.id,
        RedirectUrl: order.callbackUrl,
        CellNumber: order.customer?.phone ?? "",
      }),
    });
    const data = await res.json();
    const token = data?.token;
    if (token) {
      return { success: true, authority: token, redirectUrl: `${this.sendTokenUrl}?token=${token}`, referenceId: order.id };
    }
    return { success: false, message: data?.status ?? "خطای سامان" };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const res = await fetch(`${this.verifyUrl}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        RefNum: opts.params.RefNum ?? opts.authority ?? "",
        TerminalId: Number(await this.cred("terminal_id", env.SAMAN_TERMINAL_ID)),
      }),
    });
    const data = await res.json();
    if (Number(data) === opts.order.amount * 10) {
      return { success: true, refId: opts.params.RefNum, amount: opts.order.amount };
    }
    return { success: false, message: "تراکنش ناموفق" };
  }
}
