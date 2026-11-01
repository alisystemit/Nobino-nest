/**
 * لینک‌های عمیق نقشهٔ نشان و بلد.
 * فرمت‌ها مستقیماً از سرویس‌ها بررسی و تأیید شده‌اند:
 *  - نشان (مختصات): https://neshan.org/maps/share/{lat},{lng}  (همان مسیری که nsh.link ریدایرکت می‌کند)
 *  - نشان (جست‌وجو): https://neshan.org/maps/search/{query}
 *  - بلد (مختصات):  https://balad.ir/#{zoom}/{lat}/{lng}       (هش نقشهٔ وب بلد)
 *  - بلد (جست‌وجو):  https://balad.ir/search?text={query}
 * سالن‌هایی که هنوز مختصات ثبت نکرده‌اند با جست‌وجوی آدرس باز می‌شوند.
 */

export type MapCoords = { latitude: number; longitude: number };

const BALAD_ZOOM = 16;

/** مختصات معتبر جغرافیایی؟ (مقدارهای NaN/بی‌کران و بازه‌های نامعتبر رد می‌شوند) */
function isValidCoords(c: MapCoords | null | undefined): c is MapCoords {
  return (
    !!c &&
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    Math.abs(c.latitude) <= 90 &&
    Math.abs(c.longitude) <= 180
  );
}

/** شش رقم اعشا برای پایداری URL (بدون نماد علمی) */
function fmt(n: number): string {
  return n.toFixed(6);
}

/** رشتهٔ جست‌وجوی امن از نام/شهر/آدرس؛ اگر آدرس با نام شهر شروع شود، شهر تکراری حذف می‌شود */
export function mapSearchQuery(name: string, city?: string | null, address?: string | null): string {
  const n = (name ?? "").trim();
  let c = (city ?? "").trim();
  const a = (address ?? "").trim();
  if (c && a && (a === c || a.startsWith(`${c}،`) || a.startsWith(`${c},`) || a.startsWith(`${c} `))) c = "";
  return [n, c, a].filter(Boolean).join(" ");
}

/** لینک نشان: با مختصات → پین روی نقشه؛ بدون مختصات → جست‌وجوی آدرس */
export function neshanMapUrl(coords: MapCoords | null | undefined, query: string): string {
  if (isValidCoords(coords)) {
    return `https://neshan.org/maps/share/${fmt(coords.latitude)},${fmt(coords.longitude)}`;
  }
  return `https://neshan.org/maps/search/${encodeURIComponent(query.trim())}`;
}

/** لینک بلد: با مختصات → مرکز نقشه؛ بدون مختصات → جست‌وجوی آدرس */
export function baladMapUrl(coords: MapCoords | null | undefined, query: string): string {
  if (isValidCoords(coords)) {
    return `https://balad.ir/#${BALAD_ZOOM}/${fmt(coords.latitude)}/${fmt(coords.longitude)}`;
  }
  return `https://balad.ir/search?text=${encodeURIComponent(query.trim())}`;
}

/* ─── خواندن مختصات از لینکی که کاربر می‌چسباند ──────────────────────────── */

/**
 * parseMapLink: سالن‌دار لینک یا متن اشتراک‌گذاری بلد/نشان/گوگل را می‌چسباند و
 * مختصات استخراج می‌شود تا فیلدهای latitude/longitude خودکار پر شوند.
 * خروجی always یک union است تا UI بتواند پیام دقیق بدهد (لینک کوتاه، لینک جست‌وجو، ...).
 */
export type MapLinkSource = "neshan" | "balad" | "google" | "coords";

export type MapLinkResult =
  | { ok: true; latitude: number; longitude: number; source: MapLinkSource }
  | { ok: false; reason: "empty" | "short" | "no-coords" };

const NUM = String.raw`-?\d+(?:\.\d+)?`;

/** لینک‌های کوتاه که مختصات در خود URL ندارند و باید در مرورگر باز شوند */
const SHORT_LINK_RE = /(?:nsh\.link|maps\.app\.goo\.gl|goo\.gl|balad\.ir\/(?:p|lp|s\/)|neshan\.org\/s\/)/i;

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** ممیز فارسی/عربی (U+066B) و جداکنندهٔ هزارگان (U+066C) */
const FA_DECIMAL = "٫";
const FA_THOUSAND = "٬";

/** ارقام و ممیز فارسی/عربی → لاتین (کاربر ممکن است مختصات را با ارقام فارسی تایپ کند) */
function latinizeDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const fi = FA_DIGITS.indexOf(ch);
    if (fi >= 0) out += String(fi);
    else if (ch === FA_DECIMAL) out += ".";
    else if (ch === FA_THOUSAND) out += ",";
    else {
      const ai = AR_DIGITS.indexOf(ch);
      out += ai >= 0 ? String(ai) : ch;
    }
  }
  return out;
}

/** الگوهای «جفت مختصات» به ترتیب اولویت؛ هر الگو دو گروه (lat سپس lng) دارد */
const COORD_PATTERNS: RegExp[] = [
  // نشان: /maps/share/35.7,51.4 · /maps/place/35.7,51.4
  new RegExp(String.raw`(?:share|place|pin|marker|position)[/%20\s]*(${NUM})[\s,،/]+(${NUM})`, "i"),
  // گوگل: @35.6989,51.3989,16z  و  /maps/dir/35.7,51.4/
  new RegExp(String.raw`@(${NUM})[\s,%2C]+(${NUM})`),
  new RegExp(String.raw`/dir/(${NUM})[\s,%2C/]+(${NUM})`, "i"),
  // پارامتری: ?q=lat,lng · ?ll= · ?query= · ?destination= · ?center=
  new RegExp(String.raw`[?&](?:q|ll|query|destination|center|viewpoint)=(${NUM})[,%2C\s]+(${NUM})`, "i"),
  // مسیر zoom/lat/lng — بلد (#16/35.7/51.4) و نشان وب (/maps/16/35.7/51.4)
  new RegExp(String.raw`(?:^|[#/])\d{1,2}/(${NUM})/(${NUM})(?=[/?&#]|$)`),
  // geo: URI (اشتراک نقشهٔ گوشی)
  new RegExp(String.raw`geo:(${NUM})[,%2C\s]+(${NUM})`, "i"),
  // متن آزاد/مختصات تایپ‌شده: دو عدد اعشاری پشت هم با ویرگول، اسلش یا فاصله
  new RegExp(String.raw`(?:^|[^\d.])(-?\d{1,3}\.\d{2,})[\s,،/]+(-?\d{1,3}\.\d{2,})(?![\d.])`),
];

/** ?lat=..&lng=.. با هر ترتیبی از پارامترها */
function paramCoords(text: string): [number, number] | null {
  const lat = new RegExp(String.raw`[?&]lat(?:itude)?=(${NUM})`, "i").exec(text);
  const lng = new RegExp(String.raw`[?&](?:lng|lon|long(?:itude)?|lgn)=(${NUM})`, "i").exec(text);
  if (lat && lng) return [Number(lat[1]), Number(lng[1])];
  return null;
}

/** جفت مختصات منطقاً معتبر است؟ (بازهٔ عرض/طول جغرافیایی و غیرصفر بودن) */
function isPlausible(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6)
  );
}

function sourceOf(text: string): MapLinkSource {
  if (/neshan\.org|nsh\.link/i.test(text)) return "neshan";
  if (/balad\.ir/i.test(text)) return "balad";
  if (/google|goo\.gl|maps\.app/i.test(text)) return "google";
  return "coords";
}

/**
 * استخراج مختصات از لینک یا متن اشتراک‌گذاری نقشه.
 * لینک‌های کوتاه (nsh.link، goo.gl، balad.ir/p/…) مختصات در خود URL ندارند؛
 * کاربر باید آن‌ها را در مرورگر باز کند و آدرس کامل را کپی نماید.
 */
export function parseMapLink(raw: string | null | undefined): MapLinkResult {
  const input = latinizeDigits(String(raw ?? "")).trim();
  if (!input) return { ok: false, reason: "empty" };

  // نسخهٔ decode‌شده برای الگوهای %2C و مسیرهای encode‌شده
  let decoded = input;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    /* لینک semi-encoded — همان رشتهٔ خام استفاده می‌شود */
  }

  for (const text of [decoded, input]) {
    const explicit = paramCoords(text);
    if (explicit && isPlausible(explicit[0], explicit[1])) {
      return { ok: true, latitude: explicit[0], longitude: explicit[1], source: sourceOf(text) };
    }
    for (const re of COORD_PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (isPlausible(lat, lng)) {
        return { ok: true, latitude: lat, longitude: lng, source: sourceOf(text) };
      }
    }
  }

  if (SHORT_LINK_RE.test(`${input} ${decoded}`)) return { ok: false, reason: "short" };
  return { ok: false, reason: "no-coords" };
}

/** برچسب فارسی منبع لینک، برای پیام موفقیت در فرم */
export function mapSourceLabel(source: MapLinkSource): string {
  switch (source) {
    case "neshan":
      return "نشان";
    case "balad":
      return "بلد";
    case "google":
      return "گوگل مپس";
    default:
      return "مختصات";
  }
}
