/**
 * قرارداد یکپارچه همه درگاه‌های پرداخت.
 * هر درگاه (Adapter) این قرارداد را پیاده‌سازی می‌کند.
 */

export interface PaymentOrder {
  id: string; // شناسه سفارش ما (یا فاکتور)
  amount: number; // مبلغ به تومان
  description: string;
  callbackUrl: string; // آدرس بازگشت پس از پرداخت
  invoiceId?: string; // اگر پرداخت برای فاکتور خدماتی است
  customer?: { phone?: string; name?: string };
  metadata?: Record<string, unknown>;
}

export interface PaymentRequestResult {
  success: boolean;
  authority?: string; // کد مرجع درگاه
  redirectUrl?: string; // آدرس پرداخت
  referenceId?: string;
  message?: string;
  raw?: unknown;
}

export interface PaymentVerifyResult {
  success: boolean;
  refId?: string; // کد پیگیری تراکنش
  cardPan?: string;
  amount?: number;
  message?: string;
  raw?: unknown;
}

export interface PaymentGateway {
  readonly id: string; // zarinpal, mellat, ...
  readonly name: string; // نام فارسی درگاه
  readonly sandbox: boolean;

  /** درخواست پرداخت (مرحله اول) */
  requestPayment(order: PaymentOrder): Promise<PaymentRequestResult>;

  /** تأیید پرداخت پس از بازگشت کاربر (مرحله دوم) */
  verifyPayment(opts: {
    order: PaymentOrder;
    authority?: string;
    params: Record<string, string>;
  }): Promise<PaymentVerifyResult>;

  /** آیا این درگاه نیازمند callback با متد خاصی است؟ */
  callbackMethod(): "GET" | "POST";
}
