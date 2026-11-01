/**
 * اطلاعات «تماس با ما»ی پلتفرم — یک‌جا از دیتابیس (جدول Setting) خوانده می‌شود
 * تا سوپرادمین از پنل تنظیمات، بدون تغییر کد قابل ویرایش باشد.
 * کلیدها: contact.email / contact.phone / contact.address
 * اگر تنظیمی ثبت نشده یا خالی باشد، مقدار پیش‌فرض امن نمایش داده می‌شود.
 *
 * توجه: import کردن `@/lib/settings` عمداً داخل تابع انجام می‌شود (dynamic) تا
 * توابع خالص این فایل با `node --test` بدون resolve بودن alias قابل تست باشند.
 */

import { getSetting } from "@/lib/settings";

export type ContactInfo = { email: string; phone: string; address: string };

export const CONTACT_DEFAULTS: ContactInfo = {
  email: "support@nobino.ir",
  phone: "۰۲۱-۱۲۰۰۰۰۰۰",
  address: "تهران، ایران",
};

export const CONTACT_SETTING_KEYS = {
  email: "contact.email",
  phone: "contact.phone",
  address: "contact.address",
} as const;

/** ادغام خالص و تست‌پذیر: مقدار خامِ تنظیم (یا نبودش) + پیش‌فرض → خروجی نهایی */
export function resolveContact(raw: Partial<ContactInfo>): ContactInfo {
  const clean = (v: string | null | undefined) => (v ?? "").trim();
  return {
    email: clean(raw.email) || CONTACT_DEFAULTS.email,
    phone: clean(raw.phone) || CONTACT_DEFAULTS.phone,
    address: clean(raw.address) || CONTACT_DEFAULTS.address,
  };
}

/** خواندن اطلاعات تماس از تنظیمات زندهٔ دیتابیس (برای فوتر و صفحهٔ راهنما) */
export async function getContactInfo(): Promise<ContactInfo> {
  const [email, phone, address] = await Promise.all([
    getSetting(CONTACT_SETTING_KEYS.email),
    getSetting(CONTACT_SETTING_KEYS.phone),
    getSetting(CONTACT_SETTING_KEYS.address),
  ]);
  return resolveContact({ email, phone, address });
}
