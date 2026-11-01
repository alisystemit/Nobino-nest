/**
 * ساخت اسلاگ (آدرس عمومی سالن) از نام فارسی.
 * اسلاگ در نوبینو به‌عنوان ساب‌دامین استفاده می‌شود (bahar.nobino.ir)، پس باید
 * فقط شامل حروف کوچک انگلیسی، رقم و خط تیره باشد و با خط تیره شروع/پایان نکند.
 * تبدیل حروف فارسی به فینگلیش رایج انجام می‌شود؛ اگر نامی اصلاً قابل تبدیل نبود،
 * کاربر خودش اسلاگ را می‌نویسد (فیلد همیشه قابل ویرایش است).
 */

const FA_TO_LATIN: Record<string, string> = {
  "آ": "a",
  "أ": "a",
  "إ": "i",
  "ا": "",
  "ب": "b",
  "پ": "p",
  "ت": "t",
  "ث": "s",
  "ج": "j",
  "چ": "ch",
  "ح": "h",
  "خ": "kh",
  "د": "d",
  "ذ": "z",
  "ر": "r",
  "ز": "z",
  "ژ": "zh",
  "س": "s",
  "ش": "sh",
  "ص": "s",
  "ض": "z",
  "ط": "t",
  "ظ": "z",
  "ع": "a",
  "غ": "gh",
  "ف": "f",
  "ق": "q",
  "ك": "k",
  "ک": "k",
  "گ": "g",
  "ل": "l",
  "م": "m",
  "ن": "n",
  "و": "v",
  "ه": "h",
  "ی": "i",
  "ي": "i",
  "ة": "h",
  "ئ": "y",
};

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const MAX_SLUG_LENGTH = 48;

/** جداکننده‌های معنادار: فاصله، نقطه، اسلش، خط تیره و نمادهای چپ‌چین/راست‌چین فارسی */
const SEPARATOR_RE = /[\s._/\-\u200c\u200f]/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;

export function isSlugValid(slug: string): boolean {
  return SLUG_RE.test(slug.trim().toLowerCase());
}

/** نام سالن (فارسی یا لاتین) → اسلاگ پیشنهادی؛ رشتهٔ خالی یعنی «قابل ساخت نبود» */
export function slugifySalonName(name: string): string {
  let out = "";
  for (const ch of latinizeDigits(String(name ?? "")).toLowerCase()) {
    if (/[a-z0-9]/.test(ch)) out += ch;
    else if (FA_TO_LATIN[ch] !== undefined) out += FA_TO_LATIN[ch];
    else if (SEPARATOR_RE.test(ch)) out += "-";
    // بقیهٔ نشانه‌ها (کوک، پرانتز، ایموجی، ویرگول فارسی) حذف می‌شوند
  }
  const cleaned = out
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
  return cleaned.length >= 3 ? cleaned : "";
}

/**
 * فهرست اسلاگ‌های نامزد، از پایه تا پسوندهای عددی (-2، -3، …).
 * برای بررسی دسته‌ای در دیتابیس (slug in candidates) استفاده می‌شود.
 */
export function slugCandidates(base: string): string[] {
  const root = normalizeRoot(base);
  const list = [root];
  for (let i = 2; i <= 40; i++) {
    const suffix = `-${i}`;
    list.push(trimSuffix(`${root.slice(0, MAX_SLUG_LENGTH - suffix.length)}${suffix}`));
  }
  return list;
}

/** اسلاگ تصادفی معتبر، برای زمانی که همهٔ نامزدها گرفته‌اند */
export function randomSalonSlug(): string {
  return randomSlug();
}

/**
 * اسلاگ یکتا از روی فهرست نامزدها.
 * @param taken تابعی که می‌گوید اسلاگ قبلاً استفاده شده است
 */
export function ensureUniqueSlug(base: string, taken: (slug: string) => boolean): string {
  for (const candidate of slugCandidates(base)) {
    if (isSlugValid(candidate) && !taken(candidate)) return candidate;
  }
  let fallback = randomSlug();
  for (let guard = 0; guard < 40 && taken(fallback); guard++) fallback = randomSlug();
  return fallback;
}

function normalizeRoot(base: string): string {
  const cleaned = slugifySalonName(base) || (/[a-z]/i.test(String(base ?? "")) ? trimSuffix(String(base).toLowerCase()) : "");
  if (cleaned.length >= 3) return cleaned;
  return randomSlug();
}

function randomSlug(): string {
  return trimSuffix(`salon-${Math.random().toString(36).slice(2, 8)}`);
}

function trimSuffix(s: string): string {
  return s.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "");
}

function latinizeDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const fi = FA_DIGITS.indexOf(ch);
    if (fi >= 0) out += String(fi);
    else {
      const ai = AR_DIGITS.indexOf(ch);
      out += ai >= 0 ? String(ai) : ch;
    }
  }
  return out;
}
