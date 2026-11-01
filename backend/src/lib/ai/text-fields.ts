/**
 * استخراج نام مشتری از متن فارسی — ماژول خالص (بدون هیچ وابستگی زمان‌اجرا) تا
 * با `node --test` قابل تست باشد و هم برای گفتار ضبط‌شده و هم جملهٔ تایپ‌شده یکی برود.
 *
 * رزرو در پنل را آرایشگر برای مشتری ثبت می‌کند، پس عبارت «به نام سارا احمدی» را هم
 * مثل «اسم من سارا است» باید شناخت؛ نسخهٔ قبلی فقط حالت دوم را می‌گرفت و نامِ خودِ
 * متن نمونهٔ راهنما («… به نام سارا احمدی، شماره موبایل …») را استخراج نمی‌کرد.
 */

/** کلماتی که ادامهٔ نام نیستند؛ همان‌جا برش می‌خورد */
const NAME_STOP_WORDS = [
  "من",
  "با",
  "شماره",
  "موبایل",
  "تلفن",
  "ساعت",
  "برای",
  "خدمت",
  "هست",
  "هستم",
  "است",
  "در",
  "و",
  "که",
  "تماس",
  "صبح",
  "ظهر",
  "عصر",
  "شب",
];

/** حداکثر سه کلمهٔ فارسی، بدون نشانه‌ها و بدون کلمات راهنما */
export function trimPersianName(raw: string): string {
  const words = raw.replace(/[،,.;:!?«”"()[\]]+/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    // ضمیر اول جمله («من سارا احمدی») جزو نام نیست ولی برش نمی‌دهد؛ رد می‌شود
    if (out.length === 0 && NAME_STOP_WORDS.includes(w)) continue;
    // از اینجا به بعد کلمهٔ راهنما یعنی نام تمام شده
    if (NAME_STOP_WORDS.includes(w)) break;
    out.push(w);
    if (out.length >= 3) break;
  }
  return out.join(" ").trim();
}

/**
 * ترتیب الگوها مهم است: اول شخصِ سوم (رزرو توسط آرایشگر) و بعد اول‌شخص.
 * همه یک گروه captures می‌کنند که به `trimPersianName` می‌رود.
 */
const NAME_PATTERNS: RegExp[] = [
  /(?:به\s*نام|به‌نام|بنام)\s+([\u0600-\u06FF\s]{2,40})/,
  /(?:برای)\s+(?:خانم|آقا|آقای|بانو|مهندس)\s+([\u0600-\u06FF\s]{2,40})/,
  /(?:اسم من|نام من|اسم|نام|مِنم|منم)\s+([\u0600-\u06FF\s]{2,40})/,
];

export function extractNameFromText(text: string): string | undefined {
  for (const re of NAME_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    const name = trimPersianName(m[1]);
    if (name.length >= 3) return name;
  }
  return undefined;
}
