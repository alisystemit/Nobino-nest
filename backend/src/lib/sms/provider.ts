import { SmsProvider } from "@/lib/sms/types";
import { createSmsProvider, resolveActiveSmsProviderId, smsProviderMeta } from "@/lib/sms/providers";

/** سرویس شبیه‌سازی‌شده برای توسعه (بدون ارسال واقعی) */
class MockProvider implements SmsProvider {
  readonly id = "mock";
  readonly name = "شبیه‌سازی (تست)";
  isConfigured() {
    return true;
  }
  private log(kind: string, phone: string, extra: string) {
    console.log(`[SMS:MOCK] ${kind} به ${phone}: ${extra}`);
  }
  async sendText(phone: string, message: string) {
    this.log("متن", phone, message);
  }
  async sendOtp(phone: string, code: string) {
    this.log("OTP", phone, `کد ${code}`);
  }
  async sendAppointmentReminder(phone: string, salon: string, time: string) {
    this.log("یادآوری نوبت", phone, `${salon} ساعت ${time}`);
  }
}

let cache: { id: string; provider: SmsProvider } | null = null;

/**
 * سرویس پیامک فعال.
 * انتخاب بر اساس تنظیمات پویا (sms.active_provider) یا env انجام می‌شود.
 * اگر سرویس انتخاب‌شده کلید نداشته باشد، به شبیه‌سازی برمی‌گردیم.
 */
export async function getSmsProvider(): Promise<SmsProvider> {
  const activeId = await resolveActiveSmsProviderId();

  if (cache && cache.id === activeId) return cache.provider;

  const provider = await createSmsProvider(activeId).catch(() => null);
  if (provider && provider.isConfigured()) {
    cache = { id: activeId, provider };
    return provider;
  }

  const mock = new MockProvider();
  cache = { id: activeId, provider: mock };
  return mock;
}

/**
 * ارسال پیامک با زنجیره سرویس‌ها (fallback).
 * ابتدا سرویس فعال امتحان می‌شود؛ اگر خطا داد، به سرویس‌های بعدیِ
 * پیکربندی‌شده می‌رویم. اگر هیچ‌کدام موفق نبود، به Mock برمی‌گردیم.
 */
export async function sendSmsWithFallback(recipient: string, message: string): Promise<{ provider: string }> {
  const activeId = await resolveActiveSmsProviderId();

  // ساخت فهرست ترتیب‌دار: فعال اول، سپس بقیه سرویس‌ها
  const order = [activeId, ...smsProviderMeta.map((m) => m.id).filter((id) => id !== activeId)];

  const errors: string[] = [];
  for (const id of order) {
    try {
      const provider = await createSmsProvider(id);
      if (provider.isConfigured()) {
        await provider.sendText(recipient, message);
        return { provider: id };
      }
    } catch (e) {
      errors.push(`${id}:${e instanceof Error ? e.message.slice(0, 60) : "?"}`);
    }
  }

  // fallback نهایی
  await new MockProvider().sendText(recipient, message);
  return { provider: "mock" };
}

/** برای پنل ادمین: فهرست سرویس‌های پیامک پشتیبانی‌شده */
export { smsProviderMeta };
