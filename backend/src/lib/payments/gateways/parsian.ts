import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه پارسیان (PEC) — سرویس SOAP
 */
export class ParsianGateway extends BaseGateway {
  readonly id = "parsian";
  readonly name = "پارسیان";
  readonly sandbox = isSandbox(env.PARSIAN_SANDBOX);

  private host = "https://pec.shaparak.ir/NewIPGServices/Sale/SaleService.asmx";
  private saleUrl = "https://pec.shaparak.ir/NewIPGServices/Sale/SaleService.asmx";
  private confirmUrl = "https://pec.shaparak.ir/NewIPGServices/Confirm/ConfirmService.asmx";
  private gateway = "https://pec.shaparak.ir/NewIPG/Index.aspx";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const loginAccount = await this.cred("username", env.PARSIAN_USERNAME);
    const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
 <soap:Body><tem:SalePaymentRequest>
  <tem:LoginAccount>${loginAccount}</tem:LoginAccount>
  <tem:Amount>${order.amount * 10}</tem:Amount>
  <tem:OrderId>${Date.now()}</tem:OrderId>
  <tem:CallBackUrl>${order.callbackUrl}</tem:CallBackUrl>
  <tem:AdditionalData>${order.description}</tem:AdditionalData>
 </tem:SalePaymentRequest></soap:Body>
</soap:Envelope>`;
    const res = await fetch(this.saleUrl, {
      method: "POST",
      headers: { "Content-Type": 'text/xml; charset=utf-8', SOAPAction: '"http://tempuri.org/ISaleService/SalePaymentRequest"' },
      body: soap,
    });
    const text = await res.text();
    const tokenMatch = text.match(/<SalePaymentRequestResult>([^<]+)<\/SalePaymentRequestResult>/);
    const token = tokenMatch ? tokenMatch[1] : "";
    if (token && token !== "-1") {
      return { success: true, authority: token, redirectUrl: `${this.gateway}?token=${token}`, referenceId: token };
    }
    return { success: false, message: `کد خطای پارسیان: ${token}` };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const token = opts.authority ?? opts.params.token ?? "";
    const loginAccount = await this.cred("username", env.PARSIAN_USERNAME);
    const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">
 <soap:Body><tem:ConfirmPaymentRequest>
  <tem:LoginAccount>${loginAccount}</tem:LoginAccount>
  <tem:Token>${token}</tem:Token>
 </tem:ConfirmPaymentRequest></soap:Body>
</soap:Envelope>`;
    const res = await fetch(this.confirmUrl, {
      method: "POST",
      headers: { "Content-Type": 'text/xml; charset=utf-8', SOAPAction: '"http://tempuri.org/IConfirmService/ConfirmPaymentRequest"' },
      body: soap,
    });
    const text = await res.text();
    if (text.includes("ConfirmPaymentRequestResult>0<") || text.includes("<ConfirmPaymentRequestResult>0")) {
      return { success: true, refId: token };
    }
    return { success: false, message: "تراکنش تأیید نشد" };
  }
}
