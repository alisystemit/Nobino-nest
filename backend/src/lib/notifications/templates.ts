import { getSetting } from "@/lib/settings";

/** جایگزینی متغیرهای {...} در قالب پیامک */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

const DEFAULTS: Record<string, string> = {
  "sms.template.confirm": "نوبت شما در «{salon}» برای ساعت {time} ثبت شد. (تأیید: {code})",
  "sms.template.reminder": "یادآوری: نوبت شما در «{salon}» رأس ساعت {time} است.",
  "sms.template.cancel": "نوبت شما در «{salon}» لغو شد.",
  "sms.template.waitlist": "سلام {customer}، برای خدمت درخواستی شما در «{salon}» زمانی آزاد شده است.",
  "sms.template.sub_active": "اشتراک «{plan}» برای «{salon}» فعال شد تا {end}.",
  "sms.template.sub_expired": "اشتراک «{plan}» برای «{salon}» منقضی شد.",
};

export async function getTemplate(key: string): Promise<string> {
  const t = await getSetting(key);
  return t?.trim() || DEFAULTS[key] || "";
}

export async function renderSmsTemplate(key: string, vars: Record<string, string | number>): Promise<string> {
  const template = await getTemplate(key);
  return renderTemplate(template, vars);
}
