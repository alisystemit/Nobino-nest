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

// ─── عددنویسی گفتاری فارسی ────────────────────────────────────────────
// ASR فارسی عدد را معمولاً «به‌صورت گفتاری» می‌نویسد: «نهصد و شانزده» به‌جای
// «۹۱۶». پس فقط رقم‌واژه‌های تک‌رقمی کافی نیست؛ باید ترکیب‌های صد/ده/یکان هم
// خوانده شوند. هر «گروه» یک عدد کامل است و ارقام گروه‌ها پشت‌سرهم می‌شوند:
//   «صفر نهصد و شانزده، چهارصد و سی و چهار، دوازده صفر نه»
//   → 0 + 916 + 434 + 12 + 0 + 9 → 09164341209
type NumClass = "unit" | "teen" | "ten" | "hundred" | "thousand";

const NUMBER_WORDS: Record<string, { value: number; cls: NumClass }> = {
  // یکان‌ها (شامل تلفظ محاوره‌ای)
  صفر: { value: 0, cls: "unit" },
  یک: { value: 1, cls: "unit" },
  یه: { value: 1, cls: "unit" },
  دو: { value: 2, cls: "unit" },
  سه: { value: 3, cls: "unit" },
  چهار: { value: 4, cls: "unit" },
  چار: { value: 4, cls: "unit" },
  پنج: { value: 5, cls: "unit" },
  شش: { value: 6, cls: "unit" },
  شیش: { value: 6, cls: "unit" },
  هفت: { value: 7, cls: "unit" },
  هشت: { value: 8, cls: "unit" },
  نه: { value: 9, cls: "unit" },
  // ده تا نوزده
  ده: { value: 10, cls: "teen" },
  یازده: { value: 11, cls: "teen" },
  دوازده: { value: 12, cls: "teen" },
  سیزده: { value: 13, cls: "teen" },
  چهارده: { value: 14, cls: "teen" },
  چارده: { value: 14, cls: "teen" },
  پانزده: { value: 15, cls: "teen" },
  پونزده: { value: 15, cls: "teen" },
  شانزده: { value: 16, cls: "teen" },
  شونزده: { value: 16, cls: "teen" },
  هفده: { value: 17, cls: "teen" },
  هیفده: { value: 17, cls: "teen" },
  هجده: { value: 18, cls: "teen" },
  هیجده: { value: 18, cls: "teen" },
  نوزده: { value: 19, cls: "teen" },
  // دهگان‌ها
  بیست: { value: 20, cls: "ten" },
  سی: { value: 30, cls: "ten" },
  چهل: { value: 40, cls: "ten" },
  پنجاه: { value: 50, cls: "ten" },
  شصت: { value: 60, cls: "ten" },
  هفتاد: { value: 70, cls: "ten" },
  هشتاد: { value: 80, cls: "ten" },
  نود: { value: 90, cls: "ten" },
  // صدگان‌ها
  صد: { value: 100, cls: "hundred" },
  دویست: { value: 200, cls: "hundred" },
  سیصد: { value: 300, cls: "hundred" },
  چهارصد: { value: 400, cls: "hundred" },
  چارصد: { value: 400, cls: "hundred" },
  پانصد: { value: 500, cls: "hundred" },
  پونصد: { value: 500, cls: "hundred" },
  ششصد: { value: 600, cls: "hundred" },
  شیشصد: { value: 600, cls: "hundred" },
  هفتصد: { value: 700, cls: "hundred" },
  هشتصد: { value: 800, cls: "hundred" },
  نهصد: { value: 900, cls: "hundred" },
  // هم‌پوشانی‌ها برای اشتباهات ASR رایج (یکفده = هفده)
  "یکفده": { value: 17, cls: "teen" },
};

type NumPart = { value: number; cls: NumClass };

/**
 * آیا این عدد می‌تواند ادامهٔ گروه فعلی باشد؟ (دستور عددنویسی فارسی)
 * صد → [و] ده/ده‌تا‌نوزده/یکان ، ده → [و] یکان
 */
function canAppend(parts: NumPart[], next: NumPart): boolean {
  if (parts.length === 0) return true;
  if (next.cls === "thousand") return false;
  // «هشت هزار و دویست»: پایهٔ هزارتایی + یک زیرگروه کوچک‌تر از هزار
  if (parts[0].cls === "thousand") {
    const rest = parts.slice(1);
    return rest.length === 0 ? true : canAppend(rest, next);
  }
  if (next.cls === "hundred") return false;
  if (parts.length === 1) {
    const first = parts[0];
    if (first.cls === "hundred") return true;
    if (first.cls === "ten") return next.cls === "unit" && next.value !== 0;
    return false;
  }
  if (parts.length === 2 && parts[0].cls === "hundred" && parts[1].cls === "ten") {
    return next.cls === "unit" && next.value !== 0;
  }
  return false;
}

/**
 * «هزار» گروه چهاررقمی می‌سازد. ASR رقم آخر شماره را گاهی به‌جای سه‌رقم
 * می‌شکند و «هشت هزار و دویست» (۸۲۰۰) می‌نویسد؛ بدون این واژه، «هفتصد و
 * پنجاه، هشت هزار» به‌اشتباه ۷۵۸ خوانده می‌شد و شماره گم می‌شد.
 */
const THOUSAND_WORDS = new Set(["هزار", "هزارو"]);

/**
 * ASR «صفر» را در گفتار تلفنی زیاد با این واژه‌ها اشتباه می‌نویسد. فقط وقتی
 * به‌عنوان صفرِ ابتدای شمارهٔ موبایل خوانده می‌شوند که عدد بعدشان با ۹ شروع
 * شود؛ در بقیهٔ جمله‌ها واژهٔ معمولی‌اند و نباید عدد بسازند.
 */
const ZERO_WORD_VARIANTS = new Set(["صرف", "سرف", "سفر", "وصف", "وسف", "وسفت", "وصفت", "سفت"]);

/** «نه صد» (که ASR گاهی جدا می‌نویسد) را به «نهصد» تبدیل می‌کند. */
const HUNDRED_WORD_BY_UNIT = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];

type SpeechToken = { kind: "word" | "sep"; value: string };

/**
 * واژه‌ها و جداکننده‌ها را جدا برمی‌گرداند. ویرگول/نقطه/خط تیره معنادارند:
 * گوینده بین گروه‌های شماره مکث می‌کند و ASR همان‌جا ویرگول می‌گذارد
 * («۹۱۶، ۷۵۰، ۸۲۰۰»). فاصله جداکننده نیست تا «نه صد» یک عدد بماند.
 */
function tokenizeSpeech(text: string): SpeechToken[] {
  const re =
    /([\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\u200c]+)|([،,.;:!?؟\-–—\n\r]+)/g;
  const out: SpeechToken[] = [];
  for (const m of text.matchAll(re)) {
    if (m[1]) out.push({ kind: "word", value: m[1] });
    else if (m[2]) out.push({ kind: "sep", value: m[2] });
  }
  return out;
}

function mergeSplitHundreds(tokens: SpeechToken[]): SpeechToken[] {
  const out: SpeechToken[] = [];
  let prevWord = -1;
  for (const token of tokens) {
    if (token.kind === "sep") {
      out.push(token);
      prevWord = -1;
      continue;
    }
    if (token.value === "صد" && prevWord >= 0) {
      const prev = NUMBER_WORDS[out[prevWord].value];
      // «بیست و یک صد و ده» یعنی ۹۲۱ و ۱۱۰؛ «یک» پایانِ گروه قبلی است،
      // نه شروع «یکصد». فقط «نه صد»ِ چسبیده (بدون «و» قبلش) ادغام می‌شود.
      const afterAnd = out[prevWord - 1]?.kind === "word" && out[prevWord - 1].value === "و";
      if (prev?.cls === "unit" && prev.value >= 1 && prev.value <= 9 && !afterAnd) {
        out[prevWord] = { kind: "word", value: HUNDRED_WORD_BY_UNIT[prev.value] };
        continue;
      }
    }
    out.push(token);
    prevWord = out.length - 1;
  }
  return out;
}

/** گروه‌های عددیِ پشت‌سرهم در متن را به رشتهٔ ارقام تبدیل می‌کند. */
export function spokenDigitRuns(text: string): string[] {
  const tokens = mergeSplitHundreds(tokenizeSpeech(text));
  const runs: string[] = [];
  let groups: string[] = [];
  let parts: NumPart[] = [];

  const flushGroup = () => {
    if (!parts.length) return;
    // صفر/یک‌رقمی گفتاری باید یک رقم بماند (۰۹ نه ۹)؛ بقیه مقدار عددی گروه‌اند.
    const digits =
      parts.length === 1 && parts[0].cls === "unit"
        ? String(parts[0].value)
        : String(parts.reduce((sum, p) => sum + p.value, 0));
    groups.push(digits);
    parts = [];
  };

  const flushRun = () => {
    flushGroup();
    if (groups.length) runs.push(groups.join(""));
    groups = [];
  };

  /** «هشت هزار» → ۸۰۰۰؛ مقدار گروه فعلی در ۱۰۰۰ ضرب می‌شود. */
  const applyThousand = () => {
    if (!parts.length) return;
    const base = parts.reduce((sum, p) => sum + p.value, 0);
    parts = [{ value: base * 1000, cls: "thousand" }];
  };

  /** اولین واژهٔ عددی بعدی (با پریدن از «و» و جداکننده‌ها) — برای تشخیص مرز. */
  const firstNumberAfter = (from: number): NumPart | undefined => {
    for (let j = from; j < tokens.length; j++) {
      const t = tokens[j];
      if (t.kind === "sep" || t.value === "و") continue;
      if (THOUSAND_WORDS.has(t.value)) return undefined;
      const info = NUMBER_WORDS[t.value];
      if (info) return info;
      return undefined; // واژهٔ غیرعددی → دیگر عددی در کار نیست
    }
    return undefined;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === "sep") {
      // مکث/ویرگول مرزِ گروه است، نه مرز کل شماره
      flushGroup();
      continue;
    }
    const word = token.value;
    if (word === "و") continue; // «و» فقط داخل همان گروه معنا دارد

    // «سفت/صرف/…» فقط وقتی صفر است که عدد بعدی با ۹ شروع شود (ابتدای موبایل)
    if (ZERO_WORD_VARIANTS.has(word)) {
      const next = firstNumberAfter(i + 1);
      if (next && String(next.value).startsWith("9")) {
        flushGroup();
        parts.push({ value: 0, cls: "unit" });
      } else {
        flushRun();
      }
      continue;
    }

    if (THOUSAND_WORDS.has(word)) {
      applyThousand();
      continue;
    }

    const info = NUMBER_WORDS[word];
    if (!info) {
      // واژهٔ غیرعددی → پایان نامزد شماره (تا کلمات معمولی جمله قاطی نشوند)
      flushRun();
      continue;
    }
    // هر «صفر» مستقل است (مثل «… دوازده صفر نه»)
    if (info.value === 0) {
      flushGroup();
      parts.push(info);
      continue;
    }
    // «هفتصد و پنجاه، هشت هزار»: یکان بعدی در واقع شروع گروه «… هزار» است،
    // حتی اگر ASR ویرگول را جا انداخته باشد.
    if (info.cls === "unit" && parts.length === 2 && parts[1].cls === "ten") {
      let j = i + 1;
      while (j < tokens.length && (tokens[j].kind === "sep" || tokens[j].value === "و")) j++;
      if (j < tokens.length && THOUSAND_WORDS.has(tokens[j].value)) flushGroup();
    }
    if (!canAppend(parts, info)) flushGroup();
    parts.push(info);
  }
  flushRun();

  return runs;
}

/**
 * شماره‌ای که گفتاری بیان شده («صفر نه یک دو…» یا «صفر نهصد و شانزده…») را
 * برمی‌گرداند. فقط دنبالهٔ ۱۰–۱۱ رقمیِ شروع‌شده با ۹ پذیرفته می‌شود تا «نه» در
 * جملهٔ معمولی («نه، نمی‌خوام») یا اعداد نامرتبط اشتباهاً شماره حساب نشوند.
 */
function phoneFromSpoken(text: string): string | undefined {
  for (const digits of spokenDigitRuns(text)) {
    if (/^0?9\d{9}$/.test(digits)) {
      return digits.startsWith("0") ? digits : `0${digits}`;
    }
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
