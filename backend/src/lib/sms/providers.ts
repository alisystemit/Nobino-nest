import { getSetting } from "@/lib/settings";
import { SmsProvider, SmsProviderMeta, SmsProviderField } from "@/lib/sms/types";

/**
 * ۱۰ سرویس‌دهنده پیامک ایرانی (پنل پویا).
 * هر سرویس تنظیمات خود را از جدول `Setting` می‌خواند
 * (پیشوند `sms.<id>.`) و در نبود آن، از env استفاده می‌کند.
 */

async function cfg(prefix: string, fields: SmsProviderField[], envFallback: Record<string, string | undefined>) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const fromDb = await getSetting(`${prefix}${f.key}`);
    out[f.key] = fromDb ?? envFallback[f.key] ?? "";
  }
  return out;
}

class BaseProvider {
  constructor(protected c: Record<string, string>) {}
  protected configured(...keys: string[]) {
    return keys.every((k) => (this.c[k] ?? "").trim().length > 0);
  }
  protected async post(url: string, opts: { headers?: Record<string, string>; body?: unknown; form?: URLSearchParams }) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": opts.form ? "application/x-www-form-urlencoded" : "application/json",
        ...(opts.headers ?? {}),
      },
      body: opts.form ? opts.form : opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`SMS HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json().catch(() => null);
  }
}

// ─── ۱) کاوه‌نگار ───────────────────────────────────────────────────────
class KavenegarProvider extends BaseProvider implements SmsProvider {
  readonly id = "kavenegar";
  readonly name = "کاوه‌نگار";
  isConfigured() {
    return this.configured("apiKey");
  }
  private async send(phone: string, message: string) {
    const f = new URLSearchParams({ receptor: phone, message });
    await this.post(`https://api.kavenegar.com/v1/${this.c.apiKey}/sms/send.json`, { form: f });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۲) اس ام اس.آی‌آر (SMS.ir) ────────────────────────────────────────
class SmsDotIrProvider extends BaseProvider implements SmsProvider {
  readonly id = "smsdotir";
  readonly name = "اس ام اس.آی‌آر";
  isConfigured() {
    return this.configured("apiKey", "sender");
  }
  private async send(phone: string, message: string) {
    await this.post("https://api.sms.ir/v1/send/bulk", {
      headers: { "x-api-key": this.c.apiKey },
      body: { lineNumber: this.c.sender, messageText: message, mobiles: [phone] },
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۳) فراز اس ام اس (Ippanel) ────────────────────────────────────────
class FarazSmsProvider extends BaseProvider implements SmsProvider {
  readonly id = "farazsms";
  readonly name = "فراز اس ام اس (Ippanel)";
  isConfigured() {
    return this.configured("username", "password", "from");
  }
  private async send(phone: string, message: string) {
    await this.post("https://ippanel.com/api/v1/sms/send", {
      body: { op: "send", uname: this.c.username, pass: this.c.password, from: this.c.from, to: [phone], msg: message },
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۴) قاصدک (Ghasedak) ───────────────────────────────────────────────
class GhasedakProvider extends BaseProvider implements SmsProvider {
  readonly id = "ghasedak";
  readonly name = "قاصدک (Ghasedak)";
  isConfigured() {
    return this.configured("apiKey", "sender");
  }
  private async send(phone: string, message: string) {
    await this.post("https://api.ghasedak.me/v2/sms/send", {
      headers: { apikey: this.c.apiKey, "content-type": "application/x-www-form-urlencoded" },
      form: new URLSearchParams({ message, receptor: phone, linenumber: this.c.sender }),
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۵) ملی پیامک (Melipayamak) ────────────────────────────────────────
class MelipayamakProvider extends BaseProvider implements SmsProvider {
  readonly id = "melipayamak";
  readonly name = "ملی پیامک";
  isConfigured() {
    return this.configured("username", "password", "from");
  }
  private async send(phone: string, message: string) {
    await this.post("https://rest.melipayamak.com/v1/send/simple", {
      body: { username: this.c.username, password: this.c.password, to: phone, from: this.c.from, text: message },
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۶) ایران اس ام اس (IranSMS) ───────────────────────────────────────
class IranSmsProvider extends BaseProvider implements SmsProvider {
  readonly id = "iransms";
  readonly name = "ایران اس ام اس";
  isConfigured() {
    return this.configured("apiKey");
  }
  private async send(phone: string, message: string) {
    await this.post("https://api.iransms.co/v1/sms/send", {
      headers: { apikey: this.c.apiKey },
      body: { mobile: phone, message },
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۷) پیام رسان (PayamResan) ─────────────────────────────────────────
class PayamResanProvider extends BaseProvider implements SmsProvider {
  readonly id = "payamresan";
  readonly name = "پیام رسان";
  isConfigured() {
    return this.configured("apiKey");
  }
  private async send(phone: string, message: string) {
    await this.post("https://api.payamresan.com/v1/sms/send", {
      headers: { Authorization: `Bearer ${this.c.apiKey}` },
      body: { mobiles: [phone], message },
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۸) ناکالای (Nakalaya) ─────────────────────────────────────────────
class NakalayaProvider extends BaseProvider implements SmsProvider {
  readonly id = "nakalaya";
  readonly name = "ناکالای";
  isConfigured() {
    return this.configured("apiKey");
  }
  private async send(phone: string, message: string) {
    await this.post("https://api.nakalay.com/v1/message/send", {
      headers: { apikey: this.c.apiKey },
      body: { number: phone, text: message },
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۹) موبایل اس ام اس / همراه سامانه ─────────────────────────────────
class MobileSmsProvider extends BaseProvider implements SmsProvider {
  readonly id = "mobilesms";
  readonly name = "موبایل اس ام اس";
  isConfigured() {
    return this.configured("apiKey");
  }
  private async send(phone: string, message: string) {
    await this.post("https://api.mobilesms.ir/v1/send", {
      headers: { Authorization: `Bearer ${this.c.apiKey}` },
      body: { mobile: phone, msg: message },
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ۱۰) آرپانو (Arpano) ───────────────────────────────────────────────
class ArpanoProvider extends BaseProvider implements SmsProvider {
  readonly id = "arpano";
  readonly name = "آرپانو";
  isConfigured() {
    return this.configured("username", "password", "from");
  }
  private async send(phone: string, message: string) {
    await this.post("https://rest.arpano.ir/v1/send/simple", {
      body: { username: this.c.username, password: this.c.password, to: phone, from: this.c.from, text: message },
    });
  }
  async sendText(p: string, m: string) {
    return this.send(p, m);
  }
  async sendOtp(p: string, c: string) {
    return this.send(p, `کد ورود شما به نوبینو: ${c}`);
  }
  async sendAppointmentReminder(p: string, salon: string, time: string) {
    return this.send(p, `یادآوری نوبت آرایشگاه ${salon} — رأس ساعت ${time}.`);
  }
}

// ─── ثبت (Registry + Manifest) ─────────────────────────────────────────
const field = (key: string, label: string, type: SmsProviderField["type"] = "secret", placeholder?: string): SmsProviderField => ({ key, label, type, placeholder });

const fieldsOf = (meta: SmsProviderMeta) => meta.fields;

export const smsProviderMeta: SmsProviderMeta[] = [
  { id: "kavenegar", name: "کاوه‌نگار", description: "پرتال پیامک معتبر با پشتیبانی قوی", fields: [field("apiKey", "کلید API")], settingsPrefix: "sms.kavenegar." },
  { id: "smsdotir", name: "اس ام اس.آی‌آر", description: "سرویس رسمی SMS.ir", fields: [field("apiKey", "کلید API"), field("sender", "شماره خط", "string")], settingsPrefix: "sms.smsdotir." },
  { id: "farazsms", name: "فراز اس ام اس", description: "پنل Ippanel", fields: [field("username", "نام کاربری", "string"), field("password", "رمز عبور"), field("from", "شماره فرستنده", "string")], settingsPrefix: "sms.farazsms." },
  { id: "ghasedak", name: "قاصدک", description: "Ghasedak API", fields: [field("apiKey", "کلید API"), field("sender", "شماره خط", "string")], settingsPrefix: "sms.ghasedak." },
  { id: "melipayamak", name: "ملی پیامک", description: "پنل ملی پیامک", fields: [field("username", "نام کاربری", "string"), field("password", "رمز عبور"), field("from", "شماره فرستنده", "string")], settingsPrefix: "sms.melipayamak." },
  { id: "iransms", name: "ایران اس ام اس", description: "سرویس ایران اس ام اس", fields: [field("apiKey", "کلید API")], settingsPrefix: "sms.iransms." },
  { id: "payamresan", name: "پیام رسان", description: "API پیام رسان", fields: [field("apiKey", "کلید API")], settingsPrefix: "sms.payamresan." },
  { id: "nakalaya", name: "ناکالای", description: "پنل ناکالای", fields: [field("apiKey", "کلید API")], settingsPrefix: "sms.nakalaya." },
  { id: "mobilesms", name: "موبایل اس ام اس", description: "پنل موبایل اس ام اس", fields: [field("apiKey", "کلید API")], settingsPrefix: "sms.mobilesms." },
  { id: "arpano", name: "آرپانو", description: "پنل آرپانو", fields: [field("username", "نام کاربری", "string"), field("password", "رمز عبور"), field("from", "شماره فرستنده", "string")], settingsPrefix: "sms.arpano." },
];

const providerFactories: Record<string, (c: Record<string, string>) => SmsProvider> = {
  kavenegar: (c) => new KavenegarProvider(c),
  smsdotir: (c) => new SmsDotIrProvider(c),
  farazsms: (c) => new FarazSmsProvider(c),
  ghasedak: (c) => new GhasedakProvider(c),
  melipayamak: (c) => new MelipayamakProvider(c),
  iransms: (c) => new IranSmsProvider(c),
  payamresan: (c) => new PayamResanProvider(c),
  nakalaya: (c) => new NakalayaProvider(c),
  mobilesms: (c) => new MobileSmsProvider(c),
  arpano: (c) => new ArpanoProvider(c),
};

function envFallbackFor(id: string): Record<string, string | undefined> {
  const env: Record<string, Record<string, string | undefined>> = {
    kavenegar: { apiKey: process.env.KAVENEGAR_API_KEY },
    smsdotir: { apiKey: process.env.SMSDOTIR_API_KEY, sender: process.env.SMSDOTIR_SENDER },
    farazsms: { username: process.env.FARAZSMS_USERNAME, password: process.env.FARAZSMS_PASSWORD, from: process.env.FARAZSMS_FROM },
    ghasedak: { apiKey: process.env.GHASEDAK_API_KEY, sender: process.env.GHASEDAK_SENDER },
    melipayamak: { username: process.env.MELIPAYAMAK_USERNAME, password: process.env.MELIPAYAMAK_PASSWORD, from: process.env.MELIPAYAMAK_FROM },
    iransms: { apiKey: process.env.IRANSMS_API_KEY },
    payamresan: { apiKey: process.env.PAYAMRESAN_API_KEY },
    nakalaya: { apiKey: process.env.NAKALAYA_API_KEY },
    mobilesms: { apiKey: process.env.MOBILESMS_API_KEY },
    arpano: { username: process.env.ARPANO_USERNAME, password: process.env.ARPANO_PASSWORD, from: process.env.ARPANO_FROM },
  };
  return env[id] ?? {};
}

/** ساخت نمونه سرویس پیامک (نام‌همگام). */
export async function createSmsProvider(id: string): Promise<SmsProvider> {
  const meta = smsProviderMeta.find((m) => m.id === id);
  const factory = providerFactories[id];
  if (!meta || !factory) throw new Error(`سرویس پیامک «${id}» یافت نشد`);
  const config = await cfg(meta.settingsPrefix, fieldsOf(meta), envFallbackFor(id));
  return factory(config);
}

/** انتخاب فعال بر اساس تنظیمات پویا (یا env). */
export async function resolveActiveSmsProviderId(): Promise<string> {
  const active = await getSetting("sms.active_provider");
  if (active && providerFactories[active]) return active;
  const envActive = process.env.SMS_PROVIDER;
  if (envActive && providerFactories[envActive]) return envActive;
  return "kavenegar";
}
