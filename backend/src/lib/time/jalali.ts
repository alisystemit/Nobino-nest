/**
 * تبدیل تاریخ میلادی ↔ هجری شمسی — ماژول خالص (بدون وابستگی) تا هم در کلاینت و هم
 * با `node --test` کار کند.
 *
 * الگوریتم استاندارد جلالی (۳۳ ساله) است و صحتش در تست با `Intl` تقویم فارسی
 * (`fa-IR-u-ca-persian`) روی بازهٔ چند ساله مقایسه می‌شود. تاریخِ ذخیره‌سازی همیشه
 * میلادی (ISO) می‌ماند؛ شمسی فقط برای نمایش و انتخاب است.
 */

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** هفتهٔ ایرانی از شنبه؛ `weekdayIndex` خروجی یعنی ۰=شنبه … ۶=جمعه */
export const WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;
export const WEEKDAYS_FULL = ["شنبه", "یک‌شنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"] as const;

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export type JalaliParts = { jy: number; jm: number; jd: number };
export type GregorianParts = { gy: number; gm: number; gd: number };

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** میلادی → شمسی (gy بین ۱۶۰۰ تا ۲۵۰۰ قابل اتکاست) */
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliParts {
  const gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  const gy2 = gy <= 1600 ? gy - 621 : gy - 1600;
  const leapBase = gm > 2 ? gy2 + 1 : gy2;
  let days =
    365 * gy2 +
    div(leapBase + 3, 4) -
    div(leapBase + 99, 100) +
    div(leapBase + 399, 400) -
    80 +
    gd +
    gDaysInMonth[gm - 1];

  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  jy += div(days - 1, 365);
  if (days > 365) days = (days - 1) % 365;

  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

/** شمسی → میلادی */
export function jalaliToGregorian(jy: number, jm: number, jd: number): GregorianParts {
  let gy = jy <= 979 ? 621 : 1600;
  const jy2 = jy <= 979 ? jy : jy - 979;
  let days =
    365 * jy2 +
    div(jy2, 33) * 8 +
    div((jy2 % 33) + 3, 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);

  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  gy += div(days - 1, 365);
  if (days > 365) days = (days - 1) % 365;

  let gd = days + 1;
  const isLeapGregorian = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, isLeapGregorian ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  for (gm = 1; gm <= 12; gm++) {
    if (gd <= monthDays[gm]) break;
    gd -= monthDays[gm];
  }
  return { gy, gm, gd };
}

/** سال کبیسهٔ شمسی (اسفند ۳۰ روزه) */
export function isJalaliLeap(jy: number): boolean {
  const g = jalaliToGregorian(jy, 12, 30);
  const back = gregorianToJalali(g.gy, g.gm, g.gd);
  return back.jy === jy && back.jm === 12 && back.jd === 30;
}

/** تعداد روزهای ماه شمسی */
export function jalaliMonthDays(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isJalaliLeap(jy) ? 30 : 29;
}

/** ایندکس روز هفته با مبنای شنبه (۰=شنبه … ۶=جمعه) برای تاریخ میلادی */
export function weekdayIndexSaturdayFirst(gy: number, gm: number, gd: number): number {
  // getUTCDay: ۰=یک‌شنبه … ۶=شنبه ؛ با +۱ مبنای شنبه می‌شود
  return (new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() + 1) % 7;
}

/** ISO (YYYY-MM-DD میلادی) → شمسی */
export function isoToJalali(iso: string): JalaliParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return gregorianToJalali(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** شمسی → ISO میلادی (YYYY-MM-DD) */
export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const g = jalaliToGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`;
}

/** نمایش کوتاه شمسی با ارقام فارسی: «۴ آبان ۱۴۰۵» */
export function formatJalali(iso: string): string {
  const j = isoToJalali(iso);
  if (!j) return "";
  return toPersianDigits(`${j.jd} ${JALALI_MONTHS[j.jm - 1]} ${j.jy}`);
}

/** نمایش با نام روز هفته: «پنج‌شنبه ۸ آبان ۱۴۰۵» */
export function formatJalaliWithWeekday(iso: string): string {
  const j = isoToJalali(iso);
  if (!j) return "";
  const g = jalaliToGregorian(j.jy, j.jm, j.jd);
  const wd = WEEKDAYS_FULL[weekdayIndexSaturdayFirst(g.gy, g.gm, g.gd)];
  return `${wd} ${formatJalali(iso)}`;
}
