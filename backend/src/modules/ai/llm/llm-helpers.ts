/**
 * توابع کمکی برای مدیریت هوش مصنوعی (بدون دیتابیس و بدون fetch)
 */

export function normalizeChatUrl(raw: string, fallback = 'https://api.openai.com/v1'): string {
  let u = (raw ?? '').trim().replace(/\/+$/, '');
  if (!u) u = fallback;
  if (/\/chat\/completions$/.test(u)) return u;
  if (/\/v\d+$/.test(u) || !/\/v\d/.test(u)) u = `${u}/chat/completions`;
  else u = `${u}/v1/chat/completions`;
  return u;
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 10) return `${key.slice(0, 2)}••••`;
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function llmHttpHint(status: number, detail: string): string {
  const suffix = detail ? ` — ${detail}` : '';
  if (status === 401) return `کلید API نامعتبر است${suffix}`;
  if (status === 403) return `دسترسی با این کلید مجاز نیست${suffix}`;
  if (status === 404) return `مدل یا آدرس مسیر اشتباه است${suffix}`;
  if (status === 429) return `محدودیت نرخ یا پایان اعتبار حساب${suffix}`;
  if (status === 402) return `اعتبار حساب تمام شده است${suffix}`;
  if (status >= 500) return `سرویس موقتاً قطع است (HTTP ${status})${suffix}`;
  return `خطای سرویس (HTTP ${status})${suffix}`;
}

export function pickStringFields(raw: unknown, allowed: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const key of allowed) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }
  return out;
}

export function cleanGeneratedText(text: string): string {
  return (text ?? '')
    .trim()
    .replace(/^["'«»]+|["'«»]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
