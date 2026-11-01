/**
 * فارسی‌سازی برچسب‌ها و متن‌های فنی اعلان‌ها/پیامک‌ها برای پنل سوپرادمین.
 */

export const NOTIF_TYPE_LABELS: Record<string, string> = {
  OTP: 'کد تأیید ورود',
  APPOINTMENT_CONFIRM: 'تأیید نوبت',
  APPOINTMENT_STATUS: 'وضعیت نوبت',
  APPOINTMENT_CANCEL: 'لغو نوبت',
  APPOINTMENT_CHANGED: 'جابه‌جایی نوبت',
  REMINDER: 'یادآوری نوبت',
  WAITLIST_FREED: 'آزاد شدن صف انتظار',
  SUBSCRIPTION: 'اشتراک',
  SUBSCRIPTION_ACTIVATED: 'فعال‌سازی اشتراک',
  SUBSCRIPTION_RENEWED: 'تمدید اشتراک',
  SUBSCRIPTION_EXPIRED: 'اتمام اشتراک',
  SUBSCRIPTION_RENEWAL_REMINDER: 'یادآوری تمدید',
  SUBSCRIPTION_PAYMENT_FAILED: 'شکست پرداخت اشتراک',
  INVOICE_PAY_LINK: 'لینک پرداخت فاکتور',
  SMS_LIMIT_REACHED: 'اتمام سقف پیامک',
  SUPPORT_REPLY: 'پاسخ پشتیبانی',
  BROADCAST: 'پیام انبوه',
  MARKETING: 'کمپین تبلیغاتی',
  TXT: 'پیام متنی',
};

export function notifTypeLabel(type: string): string {
  return NOTIF_TYPE_LABELS[type] ?? type;
}

export type BadgeMeta = { label: string; cls: string; dot: string };

export const NOTIF_STATUS_META: Record<string, BadgeMeta> = {
  PENDING: {
    label: 'در صف ارسال',
    cls: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-400/20',
    dot: 'bg-amber-500',
  },
  SENT: {
    label: 'ارسال‌شده',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-400/20',
    dot: 'bg-emerald-500',
  },
  FAILED: {
    label: 'ناموفق',
    cls: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-400/20',
    dot: 'bg-red-500',
  },
  DROPPED: {
    label: 'از صف خارج شد',
    cls: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-500/25',
    dot: 'bg-neutral-400',
  },
};

export const NOTIF_CHANNEL_META: Record<string, { label: string; icon: string }> = {
  SMS: { label: 'پیامک', icon: '💬' },
  EMAIL: { label: 'ایمیل', icon: '✉️' },
  IN_APP: { label: 'درون‌برنامه‌ای', icon: '🔔' },
};

export function notifStatusMeta(status: string): BadgeMeta {
  return NOTIF_STATUS_META[status] ?? {
    label: status,
    cls: 'bg-neutral-100 text-neutral-600 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-300',
    dot: 'bg-neutral-400',
  };
}

export function notifChannelLabel(channel: string): string {
  return NOTIF_CHANNEL_META[channel]?.label ?? channel;
}

const ERROR_PATTERNS: { re: RegExp; fa: (m: RegExpMatchArray) => string }[] = [
  { re: /^SMS HTTP (\d+)/i, fa: (m) => `پاسخ سرویس پیامک: خطای ${m[1]}` },
  { re: /invalid.*(api.?key|token|secret)/i, fa: () => 'کلید API نامعتبر است' },
  { re: /(wrong|invalid|incorrect).*(password|login|credential)/i, fa: () => 'نام کاربری یا رمز سرویس اشتباه است' },
  { re: /(not.?authenticated|unauthorized|permission)/i, fa: () => 'مجوز دسترسی به سرویس پیامک وجود ندارد' },
  { re: /(insufficient|not enough|invalid credit|credit)/i, fa: () => 'اعتبار پنل پیامک کافی نیست' },
  { re: /(blacklist|banned|spam)/i, fa: () => 'خط در لیست سیاه سرویس پیامک است' },
  { re: /(invalid|wrong).*(mobile|phone|number|recipient)/i, fa: () => 'شماره گیرنده معتبر نیست' },
  { re: /(ip|allowed ip|whitelist)/i, fa: () => 'IP سرور در فهرست مجاز سرویس پیامک نیست' },
  { re: /(timeout|timed out|ETIMEDOUT|ESOCKETTIMEDOUT)/i, fa: () => 'اتمام زمان انتظار سرویس پیامک' },
  { re: /(ENOTFOUND|ECONNREFUSED|ECONNRESET|network|fetch failed|socket)/i, fa: () => 'خطای اتصال شبکه به سرویس پیامک' },
  { re: /(rate|too many|limit)/i, fa: () => 'سقف تعداد ارسال سرویس پیامک پر شده است' },
  { re: /(empty|invalid).*(sender|from)/i, fa: () => 'شماره خط فرستنده در تنظیمات سرویس پیامک نامعتبر است' },
  { re: /(sms|message).*(not send|failed|error)/i, fa: () => 'ارسال پیامک در سرویس ناموفق بود' },
  { re: /(duplicate|already)/i, fa: () => 'این پیام قبلاً ارسال شده است' },
];

export function localizeNotifError(err?: string | null): string {
  if (!err) return '';
  const text = String(err).trim();
  for (const { re, fa } of ERROR_PATTERNS) {
    const m = text.match(re);
    if (m) return fa(m);
  }
  return text;
}

export function faTimeAgo(iso: string | Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'هم‌اکنون';
  if (min < 60) return `${faNum(min)} دقیقه پیش`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${faNum(h)} ساعت پیش`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${faNum(d)} روز پیش`;
  return faDate(iso);
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function faNum(n: number | string): string {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function faDate(iso: string | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
}

export function faTimeUntil(iso: string | Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = t - Date.now();
  if (diff <= 30_000) return 'هم‌اکنون';
  const min = Math.round(diff / 60_000);
  if (min < 60) return `${faNum(min)} دقیقه دیگر`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  if (h < 24) return rest ? `${faNum(h)} ساعت و ${faNum(rest)} دقیقه دیگر` : `${faNum(h)} ساعت دیگر`;
  const d = Math.floor(h / 24);
  return `${faNum(d)} روز دیگر`;
}

export function notifBodyText(payload: unknown, channel?: string): string {
  let data: unknown = payload;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return channel === 'EMAIL' ? '' : String(data);
    }
  }
  if (!data || typeof data !== 'object') return '';
  const rec = data as Record<string, unknown>;
  const subject = typeof rec.subject === 'string' ? rec.subject.trim() : '';
  const message = typeof rec.message === 'string' ? rec.message.trim() : '';
  if (channel === 'EMAIL') return subject;
  return message || subject;
}

export const MAX_SMS_ATTEMPTS = 5;
