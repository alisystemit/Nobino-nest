import { llmModel, openaiApiKey } from "@/lib/ai/keys";
import { extractNameFromText } from "./text-fields";
import { extractPhone, extractTime, spokenDigitRuns } from "./voice-text";
import { isAnyStaffPhrase, matchService, matchStaff, serviceGroupsOf } from "./catalog-match";

// ─────────────────────────────── برای هماهنگی با parser.service.ts ──────────────────────────────
// این ماژول فقط توابع خالص دارد؛ parser.service.ts هم یک کپی از منطق را دارد که متفاوت است.
// برای اطمینان از یک‌دستی، توابعی که استفاده می‌شوند را اینجا export می‌کنیم.

export type ExtractedAppointment = {
  name?: string;
  phone?: string;
  service?: string;
  /** نام آرایشگرِ گفته‌شده — اختیاری؛ اگر مشتری گفته باشد «فرقی نمی‌کند» خالی می‌ماند */
  staff?: string;
  date?: string;
  time?: string;
  note?: string;
  rawText: string;
};

export type ExtractedField = "name" | "phone" | "service" | "staff" | "date" | "time";

export type ExtractOptions = {
  timezone?: string;
  serviceNames?: string[];
  staffNames?: string[];
  /** نام خودِ مشتری، تا با نام آرایشگر اشتباه گرفته نشود */
  customerName?: string;
};

/** تبدیل ارقام فارسی به لاتین */
function normalizeDigits(text: string): string {
  return text.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

// نام روزها پس از یکدست‌سازی نیم‌فاصله، هم به شکل پیوسته و هم جدا می‌آیند.
const WEEKDAY_TARGET: Record<string, number> = {
  "یکشنبه": 0,
  "یک شنبه": 0,
  "دوشنبه": 1,
  "دو شنبه": 1,
  "سه شنبه": 2,
  "چهارشنبه": 3,
  "چهار شنبه": 3,
  "پنجشنبه": 4,
  "پنج شنبه": 4,
  "جمعه": 5,
  "شنبه": 6,
};

// ─── تاریخ شمسی (جلالی) ───────────────────────────────────────────────
const SHAMSI_MONTHS = [
  { name: "فروردین", days: 31 },
  { name: "اردیبهشت", days: 31 },
  { name: "خرداد", days: 31 },
  { name: "تیر", days: 31 },
  { name: "مرداد", days: 31 },
  { name: "شهریور", days: 31 },
  { name: "مهر", days: 30 },
  { name: "آبان", days: 30 },
  { name: "آذر", days: 30 },
  { name: "دی", days: 30 },
  { name: "بهمن", days: 30 },
  { name: "اسفند", days: 29 },
];

// ─── تبدیل جلالی ↔ میلادی (بدون وابستگی؛ همان الگوریتم jalaali-js) ──────
function jDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}
function jMod(a: number, b: number): number {
  return a - jDiv(a, b) * b;
}

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324,
    2394, 2456, 3178,
  ];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jump = 0;

  for (let i = 1; i < breaks.length; i += 1) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += jDiv(jump, 33) * 8 + jDiv(jMod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += jDiv(n, 33) * 8 + jDiv(jMod(n, 33) + 3, 4);
  if (jMod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = jDiv(gy, 4) - jDiv((jDiv(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + jDiv(jump + 4, 33) * 33;
  let leap = jMod(jMod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    jDiv((gy + jDiv(gm - 8, 6) + 100100) * 1461, 4) +
    jDiv(153 * jMod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - jDiv(jDiv(gy + 100100 + jDiv(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + jDiv(jDiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = jDiv(jMod(j, 1461), 4) * 5 + 308;
  const gd = jDiv(jMod(i, 153), 5) + 1;
  const gm = jMod(jDiv(i, 153), 12) + 1;
  const gy = jDiv(j, 1461) - 100100 + jDiv(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - jDiv(jm, 7) * (jm - 7) + jd - 1;
}

function j2g(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    calendar: "persian",
    timeZone: "UTC",
  });
  // ایجاد تاریخ شمسی با Intl
  // Intl.DateTimeFormat با گزینهٔ calendar: "persian" تاریخ شمسی را پشتیبانی می‌کند
  // اما ما باید تاریخ را به صورت میلادی به Intl بدهیم و انتظار داشته باشیم تاریخ شمسی برگردد
  // راه حل: از j2d و d2g استفاده کنیم، اما با جبران سال
  // چون g2j اکنون درست است، می‌توانیم j2g را با سعی و خطا پیدا کنیم
  // اما راه بهتر: از جریان j2d → d2g استفاده کنیم و اصلاح کنیم

  // راه حل ساده: تابع d2g را بازنویسی کنیم که از Intl استفاده نکند
  // بلکه مستقیماً JDN را به Gregorian تبدیل کند
  return d2g(j2d(jy, jm, jd));
}

function g2j(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const fmt = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
  const date = new Date(Date.UTC(gy, gm - 1, gd));
  const parts = fmt.formatToParts(date);
  const jy = Number(parts.find((p) => p.type === "year")!.value);
  const jm = Number(parts.find((p) => p.type === "month")!.value);
  const jd = Number(parts.find((p) => p.type === "day")!.value);
  return { jy, jm, jd };
}

function pad2(value: number | string): string {
  return String(value).padStart(2, "0");
}
function isoFromParts(parts: { gy: number; gm: number; gd: number }): string {
  return `${parts.gy}-${pad2(parts.gm)}-${pad2(parts.gd)}`;
}

/** ارقام فارسی/عربی → لاتین، حذف نیم‌فاصله و یکدست‌کردن فاصله‌ها */
function normalizeFa(text: string): string {
  return normalizeDigits(text)
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** شکل ترتیبی روز ماه («دوم»، «بیستم»، «سی‌ام») → شکل اصلی عدد */
// تبدیل عدد گفتاری فارسی به رقم — برای استفاده در extractRelativeDate
const DAY_WORDS = ["یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه", "ده",
  "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده", "بیست",
  "بیست و یک", "بیست و دو", "بیست و سه", "بیست و چهار", "بیست و پنج", "بیست و شش", "بیست و هفت", "بیست و هشت", "بیست و نه", "سی", "سی و یک"];

function dayWordToNumber(word: string): number | undefined {
  const idx = DAY_WORDS.indexOf(word);
  return idx >= 0 ? idx + 1 : undefined;
}

/** شکل ترتیبی روز ماه («دوم»، «بیستم»، «سی‌ام») → شکل اصلی عدد */
const ORDINAL_TO_CARDINAL: Record<string, string> = {
  اول: "یک",
  یکم: "یک",
  دوم: "دو",
  سوم: "سه",
  چهارم: "چهار",
  پنجم: "پنج",
  ششم: "شش",
  هفتم: "هفت",
  هشتم: "هشت",
  نهم: "نه",
  دهم: "ده",
  یازدهم: "یازده",
  دوازدهم: "دوازده",
  سیزدهم: "سیزده",
  چهاردهم: "چهارده",
  پانزدهم: "پانزده",
  شانزدهم: "شانزده",
  هفدهم: "هفده",
  هجدهم: "هجده",
  نوزدهم: "نوزده",
  بیستم: "بیست",
};

function cardinalize(phrase: string): string {
  const tokens = phrase.split(/\s+/).map((token) => ORDINAL_TO_CARDINAL[token] ?? token);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    // «سی‌ام» پس از حذف نیم‌فاصله به دو واژهٔ «سی ام» تبدیل می‌شود.
    if (tokens[i] === "سی" && (tokens[i + 1] === "ام" || tokens[i + 1] === "م")) {
      out.push("سی");
      i += 1;
      continue;
    }
    out.push(tokens[i]);
  }
  return out.join(" ");
}

/** آخرین عددِ موجود در عبارت فارسی: «برا بیست و دو» → 22، «ده» → 10، «10» → 10 */
function parseFaNumberPhrase(phrase: string): number | undefined {
  const norm = normalizeFa(phrase);
  if (!norm) return undefined;
  const digits = norm.match(/(\d{1,3})\s*$/);
  if (digits) return Number(digits[1]);
  const runs = spokenDigitRuns(cardinalize(norm));
  if (!runs.length) return undefined;
  const value = Number(runs[runs.length - 1]);
  return Number.isFinite(value) ? value : undefined;
}

function numberBefore(text: string, endIndex: number): number | undefined {
  const before = text.slice(0, endIndex).trim();
  if (!before) return undefined;
  return parseFaNumberPhrase(before.split(/\s+/).slice(-8).join(" "));
}

/** تاریخ امروز در منطقهٔ زمانی سالن، به‌صورت اجزای UTC (برای جمع/تفریق روز) */
function todayInTz(timezone: string): { iso: string; y: number; m: number; d: number; utc: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const iso = fmt.format(new Date());
  const [y, m, d] = iso.split("-").map(Number);
  return { iso, y, m, d, utc: new Date(Date.UTC(y, m - 1, d)) };
}

function addDays(utc: Date, days: number): string {
  return new Date(utc.getTime() + days * 864e5).toISOString().slice(0, 10);
}

/** پیدا کردن نام ماه شمسی با مرز واژه، تا «دی» داخل «دیگه» پیدا نشود */
function findShamsiMonth(
  text: string
): { index: number; monthIndex: number; month: (typeof SHAMSI_MONTHS)[number] } | undefined {
  const ordered = SHAMSI_MONTHS.map((month, monthIndex) => ({ month, monthIndex })).sort(
    (a, b) => b.month.name.length - a.month.name.length
  );
  for (const { month, monthIndex } of ordered) {
    let from = 0;
    for (;;) {
      const index = text.indexOf(month.name, from);
      if (index < 0) break;
      // قبل از ماه باید فاصله یا شروع رشته باشد (نه حرف فارسی)
      const beforeChar = index === 0 ? " " : text[index - 1];
      // بعد از ماه باید فاصله یا پایان رشته باشد، یا "ماه" باشد
      const afterIndex = index + month.name.length;
      const afterChar = afterIndex >= text.length ? " " : text[afterIndex];
      const beforeOk = !/\p{L}/u.test(beforeChar);
      const afterOk = !/\p{L}/u.test(afterChar) || /^ماه/.test(text.slice(afterIndex));
      if (beforeOk && afterOk) return { index, monthIndex, month };
      from = index + 1;
    }
  }
  return undefined;
}

/**
 * تاریخ شمسی («بیست و دو آبان» / «۲۲ آبان») → ISO میلادی.
 * اگر تاریخِ امسال گذشته باشد، سال بعد در نظر گرفته می‌شود (نوبت آینده).
 */
export function extractShamsiDate(text: string, timezone = "Asia/Tehran"): string | undefined {
  const norm = normalizeFa(text);
  const found = findShamsiMonth(norm);
  if (!found) return undefined;

  const day = numberBefore(norm, found.index);
  if (!day || day < 1 || day > found.month.days) return undefined;

  const today = todayInTz(timezone);
  const { jy: todayJy, jm: todayJm, jd: todayJd } = g2j(today.y, today.m, today.d);
  // تبدیل تاریخ میلادی امروز به Jalali برای بررسی
  const isoToday = isoFromParts({ gy: today.y, gm: today.m, gd: today.d });
  // تبدیل Jalali امروز به میلادی برای تطبیق
  const isoFromJalaliToday = isoFromParts(j2g(todayJy, todayJm, todayJd));

  // بررسی: آیا تاریخ امسال است؟
  const isThisYear = found.monthIndex + 1 >= todayJm;
  let jy = isThisYear ? todayJy : todayJy + 1;

  // اگر تاریخ امسال گذشته باشد، سال بعد را در نظر بگیر
  const testIso = isoFromParts(j2g(jy, found.monthIndex + 1, day));
  if (testIso < isoToday) jy += 1;

  return isoFromParts(j2g(jy, found.monthIndex + 1, day));
}

/**
 * تاریخ نسبی: امروز / فردا / پس‌فردا / «N روز یا هفتهٔ دیگه».
 * N می‌تواند رقم باشد («10 روز دیگه») یا عدد گفتاری («ده روز دیگه»).
 */
export function extractRelativeDate(text: string, timezone = "Asia/Tehran"): string | undefined {
  const norm = normalizeFa(text);
  const digitNorm = normalizeDigits(norm);
  const today = todayInTz(timezone);

  // «پس‌فردا» باید قبل از «فردا» بررسی شود، وگرنه فقط یک روز جلو می‌رود.
  if (/پس\s*فردا/.test(norm)) return addDays(today.utc, 2);
  if (/فردا/.test(norm)) return addDays(today.utc, 1);
  if (/امروز/.test(norm)) return today.iso;

  let totalDays = 0;

  const units: [string, number][] = [
    ["ماه", 30], // \"ماه\" → حدود ۳۰ روز
    ["هفته", 7],
    ["روز", 1],
  ];
  for (const [unit, multiplier] of units) {
    // پیدا کردن عدد گفتاری قبل از واحد: «دو ماه» → ۲
    const unitIndex = norm.indexOf(unit);
    if (unitIndex >= 0) {
      const count = numberBefore(norm, unitIndex);
      if (count !== undefined && count >= 0) {
        totalDays += count * multiplier;
        continue;
      }
    }

    // سپس عدد رقمی را جستجو می‌کنیم: ۱۰ روز → 10 روز
    const digitMatch = new RegExp(`(\\d+)\\s*${unit}\\s*(?:دیگه|دیگر|بعد|آینده|پیش)`).exec(digitNorm);
    if (digitMatch) {
      const count = Number(digitMatch[1]);
      if (Number.isFinite(count) && count >= 0) {
        totalDays += count * multiplier;
        continue;
      }
    }
  }

  if (totalDays > 0) return addDays(today.utc, totalDays);

  return undefined;
}

/**
 * استخراج تاریخ از عبارت‌های فارسی. خروجی همیشه ISO (YYYY-MM-DD) است.
 * ترتیب: تاریخ میلادی عددی → روز هفته → نسبی → شمسی.
 */
export function resolveDate(text: string, timezone = "Asia/Tehran"): string | undefined {
  const norm = normalizeFa(text);

  // ۱) تاریخ میلادی عددی (۲۰۲۶-۱۱-۲۲)
  const numeric = norm.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (numeric) {
    const y = Number(numeric[1]);
    if (y > 1900) return `${numeric[1]}-${pad2(numeric[2])}-${pad2(numeric[3])}`;
  }

  // ۲) روزهای هفته — نام‌های بلندتر اول، تا «شنبه» داخل «یکشنبه» گرفته نشود
  const weekdays = Object.entries(WEEKDAY_TARGET).sort((a, b) => b[0].length - a[0].length);
  for (const [name, target] of weekdays) {
    if (!norm.includes(name)) continue;
    const today = todayInTz(timezone);
    let diff = (target - today.utc.getUTCDay() + 7) % 7;
    if (diff === 0 && !/این|همین/.test(norm)) diff = 7;
    return addDays(today.utc, diff);
  }

  // ۳) تاریخ نسبی (فردا، ده روز دیگه)
  const rel = extractRelativeDate(text, timezone);
  if (rel) return rel;

  // ۴) تاریخ شمسی (بیست و دو آبان)
  const shamsi = extractShamsiDate(text, timezone);
  if (shamsi) return shamsi;

  return undefined;
}

// ─────────────────────────────── توابع استخراج اصلی ──────────────────────────────

export async function extractAppointment(
  text: string,
  opts?: ExtractOptions
): Promise<ExtractedAppointment> {
  const base: ExtractedAppointment = { rawText: text };

  if (await openaiApiKey()) {
    try {
      const llmResult = await extractWithLLM(text, opts);
      if (llmResult) return { ...base, ...snapToCatalog(llmResult, opts) };
    } catch {
      // در خطا، به پارسر قاعده‌محور برمی‌گردیم
    }
  }

  base.name = extractName(text);
  base.phone = extractPhone(text);
  base.time = extractTime(text);
  base.service = extractService(text, opts?.serviceNames);
  const staff = extractStaff(text, { ...opts, customerName: opts?.customerName ?? base.name });
  if (staff) base.staff = staff;
  const date = resolveDate(text, opts?.timezone);
  if (date) base.date = date;

  return base;
}

/** خروجی LLM هم باید به نام واقعیِ کاتالوگ سالن برگردد، نه عبارتی که خودش ساخته است */
function snapToCatalog(
  result: Omit<ExtractedAppointment, "rawText">,
  opts?: ExtractOptions
): Omit<ExtractedAppointment, "rawText"> {
  const out = { ...result };
  if (out.service && opts?.serviceNames?.length) {
    const hit = matchService(out.service, opts.serviceNames.map((name) => ({ id: name, name })));
    // مبهم → عبارتِ اصلی می‌ماند تا resolveCatalog گزینه‌ها را به کاربر نشان دهد
    if (hit && !hit.ambiguous) out.service = hit.name;
  }
  if (out.staff && opts?.staffNames?.length && !isAnyStaffPhrase(out.staff)) {
    const hit = matchStaff(out.staff, opts.staffNames.map((name) => ({ id: name, name })));
    if (hit && !hit.ambiguous) out.staff = hit.name;
    else if (!hit) delete out.staff;
  } else if (out.staff && isAnyStaffPhrase(out.staff)) {
    delete out.staff;
  }
  return out;
}

export async function extractSingleField(
  field: ExtractedField,
  text: string,
  opts?: ExtractOptions
): Promise<ExtractedAppointment> {
  const base: ExtractedAppointment = { rawText: text };

  const apiKey = await openaiApiKey();
  if (apiKey) {
    try {
      const serviceHint = field === "service" && opts?.serviceNames?.length
        ? `\nپکیج‌های واقعی سالن (خروجی باید دقیقاً یکی از این‌ها باشد؛ غلط املایی و صورت گفتاری را به نزدیک‌ترین مورد نگاشت کن): ${opts.serviceNames.join("، ")}`
        : "";
      const staffHint = field === "staff" && opts?.staffNames?.length
        ? `\nآرایشگران واقعی سالن (خروجی باید دقیقاً یکی از این‌ها باشد): ${opts.staffNames.join("، ")}\nاگر مشتری گفته «فرقی نمی‌کند / هر کسی»، خروجی {} باشد.`
        : "";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: await llmModel(),
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                `مشتری پاسخ کوتاهی به فارسی داده که فقط مقدار فیلد «${field}» را می‌رساند.` +
                ` خروجی فقط JSON با یک کلید ${field} باشد. اگر مقدار قابل تشخیص نیست، خروجی {} باشد.` +
                serviceHint +
                staffHint,
            },
            { role: "user", content: text },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices: { message: { content: string } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content) as Partial<ExtractedAppointment>;
          if (parsed && parsed[field]) {
            const snapped = snapToCatalog({ [field]: String(parsed[field]) } as Omit<ExtractedAppointment, "rawText">, opts);
            const value = snapped[field];
            if (value) return { ...base, [field]: value };
          }
        }
      }
    } catch {
      // در خطا، به قاعده‌محور برمی‌گردیم
    }
  }

  switch (field) {
    case "phone": {
      const p = extractPhone(text);
      if (p) return { ...base, phone: p };
      break;
    }
    case "time": {
      const t = extractTime(text);
      if (t) return { ...base, time: t };
      break;
    }
    case "date": {
      const d = resolveDate(text, opts?.timezone);
      if (d) return { ...base, date: d };
      break;
    }
    case "service": {
      const s = extractService(text, opts?.serviceNames);
      if (s) return { ...base, service: s };
      break;
    }
    case "staff": {
      const s = extractStaff(text, opts);
      if (s) return { ...base, staff: s };
      break;
    }
    case "name": {
      const n = extractName(text, { permissive: true });
      if (n) return { ...base, name: n };
      break;
    }
  }
  return base;
}

async function extractWithLLM(
  text: string,
  opts?: ExtractOptions
): Promise<Omit<ExtractedAppointment, "rawText"> | null> {
  const serviceHint = opts?.serviceNames?.length
    ? `\nپکیج‌های واقعی سالن (service باید دقیقاً یکی از این‌ها باشد): ${opts.serviceNames.join("، ")}`
    : "";
  const staffHint = opts?.staffNames?.length
    ? `\nآرایشگران واقعی سالن (staff باید دقیقاً یکی از این‌ها باشد): ${opts.staffNames.join("، ")}`
    : "";
  const apiKey = await openaiApiKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: await llmModel(),
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "شما استخراج‌کننده اطلاعات نوبت آرایشگاه هستید. از متن فارسی ورودی، فیلدهای name، phone (با پیش‌شماره ۰۹)، service، staff، date (سال-ماه-روز میلادی) و time (HH:MM) و note را به‌صورت JSON خروجی بده. اگر مقداری نبود، کلید را حذف کن." +
            "\nاصطلاحات آرایشگری را کامل می‌شناسی: کوتاهی، فید، سایه، اصلاح و شیو، ریش، رنگ، لایت، هایلایت، بالیاژ، آمبره، مش، دکلره، کراتین، بوتاکس مو، احیا، پروتئین، صافی، اتو، براشینگ، سشوار، شینیون، بافت، اکستنشن، سرشویی، کاشت ناخن، ژلیش، لاک، مانیکور، پدیکور، فرنچ، کاشت مژه، والیوم، لیفت و لمینت مژه، اصلاح ابرو، هاشور، میکروبلیدینگ، لیفت ابرو، میکاپ، گریم، کانتور، فیشیال، پاکسازی، هیدرودرمی، میکرودرم، درماپن، مزوتراپی، جوانسازی، هایفو، آر اف، بوتاکس و ژل صورت، اپیلاسیون، وکس، بند، لیزر، ماساژ، اسپا، لاغری، تاتو، پی آر پی و کاشت مو." +
            "\nغلط املایی و صورت گفتاری/شکسته را تحمل کن و service را به نزدیک‌ترین نام واقعیِ فهرست نگاشت کن (مثلاً «کوتا هی مو» ← کوتاهی مو، «جلیش» ← ژلیش، «بدیکور» ← پدیکور). اگر هیچ نامی واقعاً مطابقت نداشت، کلید service را حذف کن و هرگز نام جدید نساز." +
            "\nstaff اختیاری است: فقط اگر مشتری نام آرایشگر را گفته باشد پر کن؛ اگر گفته «فرقی نمی‌کند / هر کسی / خودتون» کلید staff را حذف کن. نام خودِ مشتری (name) را هرگز در staff نگذار." +
            serviceHint +
            staffHint,
        },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function extractName(text: string, opts?: { permissive?: boolean }): string | undefined {
  return extractNameFromText(text, opts);
}

/**
 * پکیجِ گفته‌شده → نام واقعیِ کاتالوگ سالن.
 * بدون کاتالوگ، برچسب متعارفِ واژه‌نامه برگردانده می‌شود تا مسیرِ بدونِ سالن هم چیزی بفهمد.
 */
function extractService(text: string, serviceNames?: string[]): string | undefined {
  if (serviceNames?.length) {
    const hit = matchService(text, serviceNames.map((name) => ({ id: name, name })));
    // در حالت مبهم نباید نام یکی از گزینه‌ها جا زده شود؛ همان صورتِ گفته‌شده برمی‌گردد
    // تا مسیر transcribe دوباره تطبیق دهد و فهرست گزینه‌ها را به کاربر نشان دهد.
    return hit ? (hit.ambiguous ? hit.phrase : hit.name) : undefined;
  }
  return serviceGroupsOf(text)[0];
}

/** نام آرایشگرِ گفته‌شده (اختیاری). «فرقی نمی‌کند» یعنی بدون ترجیح، پس چیزی برنمی‌گرداند. */
function extractStaff(text: string, opts?: ExtractOptions): string | undefined {
  if (isAnyStaffPhrase(text)) return undefined;
  if (!opts?.staffNames?.length) return undefined;
  const hit = matchStaff(text, opts.staffNames.map((name) => ({ id: name, name })), {
    exclude: [opts.customerName ?? ""],
  });
  return hit ? (hit.ambiguous ? hit.phrase : hit.name) : undefined;
}

const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
export { DAY_NAMES };