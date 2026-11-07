/**
 * قالب‌بندی فارسی مینی‌اپ — اعداد، قیمت، تاریخ/ساعت شمسی.
 * همه‌چیز با Intl و «رقم لاتین در کد، رقم فارسی در نمایش» کار می‌کند.
 */

const FA = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** رقم‌های ASCII داخل یک رشته به فارسی تبدیل می‌شوند */
export function faDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA[Number(d)]);
}

/** تاریخ میلادی (YYYY-MM-DD) را به شمسی با اعداد فارسی تبدیل می‌کند */
export function gregorianToShamsiFa(isoDate: string): string {
  if (!isoDate || isoDate.length < 10) return isoDate;
  try {
    const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
    const fmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      // ورودی تاریخِ خالص است؛ بدون UTC مرورگر در منطقهٔ غربی یک روز عقب نشان می‌دهد
      timeZone: "UTC",
    });
    const date = new Date(Date.UTC(y, m - 1, d));
    const formatted = fmt.format(date);
    // اطمینان از بازگشت رشته معتبر
    return formatted || isoDate;
  } catch (e) {
    console.warn("gregorianToShamsiFa failed:", e);
    return isoDate;
  }
}

/**
 * رقم‌های یک «متن فارسی» به ارقام فارسی تبدیل می‌شوند — برای نمایش نام‌ها و
 * توضیح‌هایی که مستقیم از دیتابیس می‌آیند (مثلاً «لمینت مژه 2-1»).
 *
 * چرا لازم است؟ فونت Yekan که کل صفحه با آن ست می‌شود هیچ رقم و حرف لاتینی
 * ندارد؛ پس «2-1» وسط یک رشتهٔ فارسی از فونت بعدی (Vazirmatn) و با وزن مصنوعی
 * رندر می‌شود: قد و ضخامتش با بقیهٔ رشته فرق می‌کند و چون رقم‌های لاتین (EN)
 * کنار رقم‌های فارسی (AN) می‌نشینند، ترتیب نمایش (bidi) کل خط به‌هم می‌ریزد.
 *
 * ایمنی: رشته‌ای که هیچ حرف فارسی ندارد دست‌نخورده می‌ماند، پس نشانی
 * (rose.localhost:3100)، شمارهٔ تماس، کد و متن انگلیسی خراب نمی‌شوند.
 * داخل متن فارسی هم تکه‌های فنی (پیوند، دامنه، @یوزرنیم) شناسایی و
 * دست‌نخورده می‌مانند — فقط رقم‌های بخش فارسی تبدیل می‌شوند.
 * روی رشته‌های از قبل فارسی بی‌اثر و قابل تکرار است.
 */

/** تکه‌های «فنی» که رقم‌هایشان باید لاتین بمانند (پیوند، دامنه، هندل، شمارهٔ بین‌المللی، توکن حرف+رقم مثل C13) */
const TECHNICAL = /(https?:\/\/\S+|www\.\S+|[\w-]+\.(?:ir|com|net|org|io|dev|app|site|shop)\b\S*|@[A-Za-z0-9_.]{3,}|\+\d[\d\s().-]{7,}|[A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*|\d[A-Za-z0-9_-]*[A-Za-z])/gi;

export function faText(input: string | null | undefined): string {
  const s = input == null ? "" : String(input);
  if (!s || !/[0-9\u0660-\u0669]/.test(s)) return s;
  // حرف‌های خط فارسی/عربی: U+0621..U+06FF («پ/چ/ژ/ک/گ/ی» و ارقام فارسی در انتهای این بلوک‌اند)
  if (!/[\u0621-\u06FF]/.test(s)) return s;
  const toFa = (part: string) =>
    part.replace(/[\u0660-\u0669]/g, (d) => FA[d.charCodeAt(0) - 0x0660]).replace(/[0-9]/g, (d) => FA[Number(d)]);
  // split با capture group: جای‌نمای فرد همان تکهٔ فنی است و دست نمی‌خورد
  return s.split(TECHNICAL).map((part, i) => (i % 2 ? part : toFa(part))).join("");
}

/** «شهر · نشانی» بدون تکرار شهر — نشانی فارسی معمولاً با خودِ شهر شروع می‌شود */
export function locationLine(city?: string | null, address?: string | null, sep = " · "): string {
  const c = (city ?? "").trim();
  const a = (address ?? "").trim();
  if (!c) return a;
  if (!a) return c;
  const rest = a.startsWith(`${c}،`) || a.startsWith(`${c},`) ? a.slice(c.length + 1).trim() : a;
  return rest ? `${c}${sep}${rest}` : c;
}

/** برچسب فارسی نوع سالن؛ مقدار ناشناس رشتهٔ خالی می‌دهد تا بج نمایش داده نشود */
export function salonTypeLabel(type?: string | null): string {
  switch ((type ?? "").toUpperCase()) {
    case "MEN":
      return "مردانه";
    case "COUPLE":
      return "مشترک";
    case "WOMEN":
      return "بانوان";
    default:
      return "";
  }
}

/** ۱۲۵۰۰۰ → «۱۲۵٬۰۰۰ تومان» */
export function toman(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("fa-IR").format(Math.round(amount)) + " تومان";
}

/**
 * قیمت فشرده برای کارت‌ها: «۵۰۰ هزار».
 * تا پیش از این هر مبلغی بر حسب «هزار» نوشته می‌شد و ۲۲۰۰۰۰۰ می‌شد
 * «۲۲۰۰ هزار» — عددی که در فارسی خوانده نمی‌شود. از ۱ میلیون به بالا همان
 * compactToman به کار می‌رود: «۲/۲ میلیون».
 */
export function shortPrice(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "رایگان";
  if (amount < 1000) return faDigits(amount) + " تومان";
  return compactToman(amount);
}

/**
 * عدد فشردهٔ تومان برای جا شدن در یک خط: 2٬851٬000 → «2/9 میلیون».
 * shortPrice هم از همین‌جا می‌گذرد، پس هر دو یک شکل خوانا دارند.
 */
export function compactToman(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  if (!n) return "۰";
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  if (v >= 1_000_000_000) return `${sign}${faDigits((v / 1_000_000_000).toFixed(1)).replace(".", "/")} میلیارد`;
  if (v >= 1_000_000) return `${sign}${faDigits((v / 1_000_000).toFixed(1)).replace(".", "/")} میلیون`;
  if (v >= 1000) return `${sign}${faDigits(Math.round(v / 1000))} هزار`;
  return `${sign}${faDigits(v)}`;
}

/** مدت: 90 → «۱ ساعت و ۳۰ دقیقه» */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0));
  if (m < 60) return `${faDigits(m)} دقیقه`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!rest) return h === 1 ? "۱ ساعت" : `${faDigits(h)} ساعت`;
  return `${faDigits(h)} ساعت و ${faDigits(rest)} دقیقه`;
}

function opts(tz?: string): Intl.DateTimeFormatOptions & { timeZone?: string } {
  return tz ? { timeZone: tz } : {};
}

/** ساعت کوتاه: «۱۴:۳۰» */
export function timeLabel(iso: string, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", ...opts(tz) }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/** تاریخ شمسی کوتاه: «۱ آذر» */
export function dayLabel(dateKey: string, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { 
      day: "numeric", 
      month: "long", 
      calendar: "persian",
      ...opts(tz) 
    }).format(new Date(`${dateKey}T12:00:00`));
  } catch {
    return dateKey;
  }
}

/** نام روز شمسی: «دوشنبه» */
export function weekdayLabel(dateKey: string, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { weekday: "long", ...opts(tz) }).format(new Date(`${dateKey}T12:00:00`));
  } catch {
    return "";
  }
}

/** برچسب «امروز / فردا / پس‌فردا» و در غیر این صورت نام روز */
export function relativeDayLabel(dateKey: string, tz?: string): string {
  const idx = dayIndexOffset(dateKey, tz);
  if (idx === 0) return "امروز";
  if (idx === 1) return "فردا";
  if (idx === 2) return "پس‌فردا";
  return weekdayLabel(dateKey, tz);
}

/** نام روزهای هفته به شیوهٔ ایرانی؛ ایندکس ۰ = شنبه (همان dayOfWeek در دیتابیس) */
export const WEEKDAYS_FA = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

/** شمارهٔ امروز در هفته به شیوهٔ ایرانی (شنبه = ۰) در منطقهٔ زمانی سالن */
export function todayWeekdayIndex(tz?: string): number {
  const map: Record<string, number> = { Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6 };
  try {
    const short = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      ...(tz ? { timeZone: tz } : {}),
    }).format(new Date());
    const idx = map[short.slice(0, 3)];
    if (idx != null) return idx;
  } catch {
    /* منطقهٔ زمانی ناشناخته */
  }
  return (new Date().getDay() + 1) % 7;
}

/** اختلاف تاریخ با «امروز» به عدد (منفی = گذشته) */
export function dayIndexOffset(dateKey: string, tz?: string): number {
  const today = ymd(new Date(), tz);
  return daysBetween(today, dateKey);
}

/** YYYY-MM-DD یک لحظه، در منطقهٔ زمانی سالن */
export function ymd(date: Date, tz?: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz ?? undefined }).format(date);
    return parts; // en-CA → YYYY-MM-DD
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** «۱۲ آذر ۱۴۰۴، دوشنبه ساعت ۱۴:۳۰» */
export function fullLabel(iso: string, tz?: string): string {
  try {
    const d = new Intl.DateTimeFormat("fa-IR", { 
      weekday: "long", 
      day: "numeric", 
      month: "long", 
      year: "numeric", 
      calendar: "persian",
      ...opts(tz) 
    }).format(new Date(iso));
    return `${d} — ساعت ${timeLabel(iso, tz)}`;
  } catch {
    return iso;
  }
}

/** فاصلهٔ زمانی نسبت به حالا: «۳ ساعت دیگر» / «دیروز» */
export function fromNow(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  const mins = Math.round(abs / 60000);
  if (mins < 60) return past ? `${faDigits(Math.max(1, mins))} دقیقه پیش` : `${faDigits(mins)} دقیقه دیگر`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return past ? `${faDigits(hours)} ساعت پیش` : `${faDigits(hours)} ساعت دیگر`;
  const days = Math.round(hours / 24);
  if (days === 1) return past ? "دیروز" : "فردا";
  return past ? `${faDigits(days)} روز پیش` : `${faDigits(days)} روز دیگر`;
}

/** میانگین امتیاز با یک رقم اعشار و رقم فارسی */
export function ratingText(rating: number | null | undefined, count: number): string {
  if (rating == null) return count ? `${faDigits(count)} نظر` : "بدون نظر";
  return `${faDigits(rating.toFixed(1))} از ۵ · ${faDigits(count)} نظر`;
}

/** نرمال‌سازی شمارهٔ تلفن ایران به قالب 09xxxxxxxxx (ارقام فارسی هم پذیرفته می‌شود) */
export function normalizePhone(input: string): string {
  const digits = String(input ?? "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[^\d]/g, "");
  if (/^\+?989\d{9}$/.test(digits)) return `0${digits.slice(-10)}`;
  if (/^00989\d{9}$/.test(digits)) return `0${digits.slice(-10)}`;
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return digits;
}

export function isPhone(value: string): boolean {
  return /^09\d{9}$/.test(normalizePhone(value));
}

/** حروف اول نام برای آواتار متنی */
export function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "ن";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? "") + (parts[1][0] ?? "");
}

/** رشتهٔ عددی دست‌نویس کاربر (ارقام فارسی/عربی و جداکنندهٔ هزارگان) → عدد */
export function toNumber(input: string | number): number {
  const s = String(input ?? "")
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\d-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** hex → «225,29,99» برای تزریق در CSS variable */
export function hexToRgb(hex: string): string | null {
  const v = (hex || "").trim().replace(/^#/, "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return null;
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
