import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه بانک ملت (BehPardakht) — از طریق سرویس SOAP
 * در حالت غیر سندباکس، نیاز به terminalId/username/password دارد.
 */
export class MellatGateway extends BaseGateway {
  readonly id = "mellat";
  readonly name = "بانک ملت (به‌پرداخت)";
  readonly sandbox = isSandbox(env.MELLAT_SANDBOX);

  private host = "https://bpm.shaparak.ir/pgwchannel/services/pgw";
  private startPayUrl = "https://bpm.shaparak.ir/pgwchannel/startpay.mellat";

  private async soapCall(service: string, bodyXml: string): Promise<string> {
    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${this.host}">
 <soapenv:Header/>
 <soapenv:Body>${bodyXml}</soapenv:Body>
</soapenv:Envelope>`;
    const res = await fetch(`${this.host}`, {
      method: "POST",
      headers: {
        "Content-Type": 'text/xml; charset=utf-8',
        SOAPAction: `"${this.host}/${service}"`,
      },
      body: soap,
    });
    return res.text();
  }

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const refId = Date.now().toString();
    const terminalId = await this.cred("terminal_id", env.MELLAT_TERMINAL_ID);
    const userName = await this.cred("username", env.MELLAT_USERNAME);
    const userPassword = await this.cred("password", env.MELLAT_PASSWORD);
    const xml = `<web:bpPayRequest>
      <web:terminalId>${terminalId}</web:terminalId>
      <web:userName>${userName}</web:userName>
      <web:userPassword>${userPassword}</web:userPassword>
      <web:orderId>${refId}</web:orderId>
      <web:amount>${order.amount * 10}</web:amount>
      <web:localDate>${new Date().toISOString().slice(0, 10)}</web:localDate>
      <web:localTime>${new Date().toTimeString().slice(0, 8)}</web:localTime>
      <web:additionalData>${order.description}</web:additionalData>
      <web:callBackUrl>${order.callbackUrl}</web:callBackUrl>
      <web:payerId>0</web:payerId>
    </web:bpPayRequest>`;
    const response = await this.soapCall("bpPayRequest", xml);
    // پاسخ: 0,کدتوکن — 0 یعنی موفق
    const match = response.match(/<return>([^<]+)<\/return>/);
    const [code, token] = match ? match[1].split(",") : [];
    if (code === "0" && token) {
      return {
        success: true,
        authority: token,
        redirectUrl: `${this.startPayUrl}?RefId=${token}`,
        referenceId: refId,
      };
    }
    return { success: false, message: `کد خطای ملت: ${code}` };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const refId = opts.params.RefId ?? opts.authority ?? "";
    const terminalId = await this.cred("terminal_id", env.MELLAT_TERMINAL_ID);
    const userName = await this.cred("username", env.MELLAT_USERNAME);
    const userPassword = await this.cred("password", env.MELLAT_PASSWORD);
    const xml = `<web:bpVerifyRequest>
      <web:terminalId>${terminalId}</web:terminalId>
      <web:userName>${userName}</web:userName>
      <web:userPassword>${userPassword}</web:userPassword>
      <web:orderId>${opts.params.orderId ?? ""}</web:orderId>
      <web:saleOrderId>${opts.params.SaleOrderId ?? ""}</web:saleOrderId>
      <web:saleReferenceId>${opts.params.SaleReferenceId ?? ""}</web:saleReferenceId>
    </web:bpVerifyRequest>`;
    const response = await this.soapCall("bpVerifyRequest", xml);
    const match = response.match(/<return>([^<]+)<\/return>/);
    const code = match ? match[1] : "";
    if (code === "0") {
      return { success: true, refId, message: "تأیید ملت موفق" };
    }
    return { success: false, message: `کد خطای ملت: ${code}` };
  }
}
