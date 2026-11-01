import { BaseGateway } from "@/lib/payments/gateways/base";
import { PaymentOrder, PaymentRequestResult, PaymentVerifyResult } from "@/lib/payments/types";
import { env, isSandbox } from "@/lib/env";

/**
 * درگاه به‌پرداخت ملت (BehPardakht) — نام تجاری درگاه بانک ملت.
 * پیاده‌سازی فنی همانند درگاه «ملت» است و از ترمینال مشترک استفاده می‌کند.
 */
export class BehPardakhtGateway extends BaseGateway {
  readonly id = "behpardakht";
  readonly name = "به‌پرداخت ملت";
  readonly sandbox = isSandbox(env.BEHPARDAKHT_SANDBOX);

  private host = "https://bpm.shaparak.ir/pgwchannel/services/pgw";
  private startPayUrl = "https://bpm.shaparak.ir/pgwchannel/startpay.mellat";

  async doRequestPayment(order: PaymentOrder): Promise<PaymentRequestResult> {
    const refId = Date.now().toString();
    const terminalId = await this.cred("terminal_id", env.BEHPARDAKHT_MERCHANT_ID);
    const userName = await this.cred("username", env.MELLAT_USERNAME);
    const userPassword = await this.cred("password", env.MELLAT_PASSWORD);
    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${this.host}">
 <soapenv:Header/><soapenv:Body>
 <web:bpPayRequest>
  <web:terminalId>${terminalId}</web:terminalId>
  <web:userName>${userName}</web:userName>
  <web:userPassword>${userPassword}</web:userPassword>
  <web:orderId>${refId}</web:orderId>
  <web:amount>${order.amount * 10}</web:amount>
  <web:callBackUrl>${order.callbackUrl}</web:callBackUrl>
  <web:additionalData>${order.description}</web:additionalData>
 </web:bpPayRequest></soapenv:Body>
</soapenv:Envelope>`;
    const res = await fetch(this.host, {
      method: "POST",
      headers: { "Content-Type": 'text/xml; charset=utf-8', SOAPAction: `"${this.host}/bpPayRequest"` },
      body: soap,
    });
    const text = await res.text();
    const match = text.match(/<return>([^<]+)<\/return>/);
    const [code, token] = match ? match[1].split(",") : [];
    if (code === "0" && token) {
      return { success: true, authority: token, redirectUrl: `${this.startPayUrl}?RefId=${token}`, referenceId: refId };
    }
    return { success: false, message: `کد خطای به‌پرداخت: ${code}` };
  }

  async doVerifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult> {
    const terminalId = await this.cred("terminal_id", env.BEHPARDAKHT_MERCHANT_ID);
    const userName = await this.cred("username", env.MELLAT_USERNAME);
    const userPassword = await this.cred("password", env.MELLAT_PASSWORD);
    const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${this.host}">
 <soapenv:Header/><soapenv:Body>
 <web:bpVerifyRequest>
  <web:terminalId>${terminalId}</web:terminalId>
  <web:userName>${userName}</web:userName>
  <web:userPassword>${userPassword}</web:userPassword>
  <web:orderId>${opts.params.orderId ?? ""}</web:orderId>
  <web:saleOrderId>${opts.params.SaleOrderId ?? ""}</web:saleOrderId>
  <web:saleReferenceId>${opts.params.SaleReferenceId ?? ""}</web:saleReferenceId>
 </web:bpVerifyRequest></soapenv:Body>
</soapenv:Envelope>`;
    const res = await fetch(this.host, {
      method: "POST",
      headers: { "Content-Type": 'text/xml; charset=utf-8', SOAPAction: `"${this.host}/bpVerifyRequest"` },
      body: soap,
    });
    const text = await res.text();
    const match = text.match(/<return>([^<]+)<\/return>/);
    const code = match ? match[1] : "";
    if (code === "0") {
      return { success: true, refId: opts.params.SaleReferenceId ?? "" };
    }
    return { success: false, message: `کد خطای به‌پرداخت: ${code}` };
  }
}
