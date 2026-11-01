/**
 * استخراج شمارهٔ موبایل و ساعت از گفتار فارسی — ماژول خالص و بدون وابستگی،
 * تا با `node --test` تست شود و برای گفتارِ ضبط‌شده و جملهٔ تایپ‌شده یکسان کار کند.
 *
 * دو باگ واقعی که اینجا پوشش داده می‌شود:
 * ۱) عددهای شمارهٔ موبایل نباید به‌عنوان ساعت خوانده شوند («۰۹۱۲…» قبلاً ۰۹:۰۰ می‌داد).
 * ۲) مردم ساعت را با کلمه می‌گویند («ساعت ده صبح»)؛ الگوی قبلی فقط رقم می‌شناخت.
 */

export function normalizePersianDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (d) => {
    const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(d);
    if (fa >= 0) return String(fa);
    const ar = "٠١٢٣٤٥٦٧٨٩".indexOf(d);
    return String(ar);
  });
}

// ─── شمارهٔ موبایل ─────────────────────────────────────────────────────

const PHONE_RE = /(?:0|\+98)?9\d{9}/;

const DIGIT_WORDS: Record<string, string> = {
  صفر: "0", یک: "1", دو: "2", سه: "3", چهار: "4", پنج: "5",
  شش: "6", هفت: "7", هشت: "8", نه: "9",
};

/**
 * شماره‌ای که کلمه‌به‌کلمه گفته شده («صفر نه یک دو…») را برمی‌گرداند.
 * فقط دنبالهٔ پشت‌سرهمِ ۱۰ تا ۱۱ رقم‌واژه پذیرفته می‌شود تا «نه» در جملهٔ
 * معمولی («نه، نمی‌خوام») اشتباهاً رقم حساب نشود.
 */
function phoneFromSpoken(text: string): string | undefined {
  const alt = Object.keys(DIGIT_WORDS).join("|");
  const re = new RegExp(`(?:${alt})(?:[\\s،.-]+(?:و[\\s،.-]+)?(?:${alt})){9,10}`, "g");
  const runs = normalizePersianDigits(text).match(re);
  if (!runs) return undefined;
  for (const run of runs) {
    const digits = run
      .split(/[\s،.-]+/)
      .filter((w) => w !== "و")
      .map((w) => DIGIT_WORDS[w] ?? "")
      .join("");
    const m = digits.match(/9\d{9}/);
    if (m) return `0${m[0]}`;
  }
  return undefined;
}

export function extractPhone(text: string): string | undefined {
  // ارقامی که با فاصله/خط تیرهٔ داخل شماره آمده‌اند یک‌دست می‌شوند
  const normalized = normalizePersianDigits(text).replace(/(?<=\d)[\s-]+(?=\d)/g, "");
  const m = normalized.match(PHONE_RE);
  if (m) {
    const raw = m[0].replace("+98", "0");
    return raw.startsWith("0") ? raw : `0${raw}`;
  }
  return phoneFromSpoken(text);
}

// ─── ساعت ──────────────────────────────────────────────────────────────

const HOUR_WORDS: Record<string, number> = {
  یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10,
  یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14, پانزده: 15, شانزده: 16, هفده: 17,
  هجده: 18, نوزده: 19, بیست: 20, "بیست و یک": 21, "بیست و دو": 22, "بیست و سه": 23,
};
const PART_OF_DAY = "صبح|ظهر|عصر|شب|بعدازظهر|بعد از ظهر";

/** «و نیم»/«و ربع»/«و سه ربع» یا دقیقهٔ عددی را به دقیقه تبدیل می‌کند */
function minutesFrom(raw?: string): number {
  if (!raw) return 0;
  const t = raw.replace(/\s+/g, " ").trim();
  if (t === "نیم") return 30;
  if (t === "ربع") return 15;
  if (t === "سه ربع") return 45;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 59 ? n : 0;
}

function to24h(hour: number, part?: string): number | undefined {
  if (hour >= 13 && hour <= 23) return hour;
  if (hour < 1 || hour > 12) return undefined;
  if (part && (part === "عصر" || part === "شب" || part === "بعدازظهر" || part === "بعد از ظهر" || part === "ظهر")) {
    if (hour < 12) return hour + 12;
  }
  return hour;
}

export function extractTime(text: string): string | undefined {
  const t = normalizePersianDigits(text);

  // ۱) ساعت با دونقطه (۱۰:۳۰) — با مرز رقم تا «۰۹۱۲...» اشتباه گرفته نشود
  const hm = t.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/);
  if (hm) {
    const h = parseInt(hm[1], 10);
    const mm = parseInt(hm[2], 10);
    if (h >= 0 && h <= 23 && mm >= 0 && mm <= 59) {
      return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }
  }

  // ۲) «ساعت ۱۰ [و نیم] [صبح]» یا «۱۰ صبح/عصر/شب»
  const clock = t.match(
    new RegExp(`ساعت\\s*(?<!\\d)(\\d{1,2})(?!\\d)(?:\\s*و\\s*(نیم|ربع|سه\\s*ربع|\\d{1,2}))?(?:\\s*(${PART_OF_DAY}))?`)
  );
  const withPart = t.match(new RegExp(`(?<!\\d)(\\d{1,2})(?!\\d)\\s*(${PART_OF_DAY})`));
  const numericMatch = clock ?? withPart;
  if (numericMatch) {
    const h = to24h(parseInt(numericMatch[1], 10), clock ? numericMatch[3] : numericMatch[2]);
    const mm = clock ? minutesFrom(numericMatch[2]) : 0;
    if (h !== undefined) return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // ۳) ساعت با کلمه: «ساعت ده صبح»، «پنج عصر»
  const wordAlt = Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join("|");
  const wordClock = t.match(
    new RegExp(`ساعت\\s*(${wordAlt})(?:\\s*و\\s*(نیم|ربع|سه\\s*ربع|\\d{1,2}))?(?:\\s*(${PART_OF_DAY}))?`)
  );
  const wordWithPart = t.match(new RegExp(`(?:^|[\\s،])(${wordAlt})\\s*(${PART_OF_DAY})`));
  const wordMatch = wordClock ?? wordWithPart;
  if (wordMatch) {
    const hour = HOUR_WORDS[wordMatch[1]];
    const part = wordClock ? wordMatch[3] : wordMatch[2];
    const h = hour !== undefined ? to24h(hour, part) : undefined;
    const mm = wordClock ? minutesFrom(wordMatch[2]) : 0;
    if (h !== undefined) return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  return undefined;
}
