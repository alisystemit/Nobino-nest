/** قرارداد مشترک سرویس‌های ارسال پیامک ایرانی */
export interface SmsProvider {
  readonly id: string;
  readonly name: string;
  /** آیا برای ارسال آماده است (کلیدها تنظیم شده‌اند)؟ */
  isConfigured(): boolean;
  sendText(phone: string, message: string): Promise<void>;
  sendOtp(phone: string, code: string): Promise<void>;
  sendAppointmentReminder(phone: string, salon: string, time: string): Promise<void>;
}

/** فیلدهای پیکربندی هر سرویس‌دهنده */
export interface SmsProviderField {
  key: string; // مثل apiKey
  label: string;
  type: "secret" | "string" | "number";
  placeholder?: string;
}

/** توصیف یک سرویس‌دهنده برای نمایش در پنل ادمین */
export interface SmsProviderMeta {
  id: string;
  name: string;
  description: string;
  fields: SmsProviderField[];
  settingsPrefix: string; // مثل sms.kavenegar.
}
