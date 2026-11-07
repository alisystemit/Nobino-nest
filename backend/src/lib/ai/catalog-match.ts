/**
 * تطبیق «چیزی که مشتری گفت» با کاتالوگ واقعی سالن — بدون حدس‌زدنِ خدمتِ ناموجود.
 *
 * سه کانال امتیازدهی با هم بیشینه گرفته می‌شوند:
 *  ۱) شباهت رشته‌ای (نرمال‌سازی فارسی + فاصله‌زدایی + لونشتاین + هم‌آوا)
 *  ۲) هم‌پوشانی گروه‌های واژه‌نامهٔ آرایشگری (salon-lexicon)
 *  ۳) برای نام اشخاص: پنجره‌های واژه‌ای روی جمله، تا «با خانم مریم رضایی» هم فهمیده شود
 *
 * اگر دو گزینه هم‌امتیاز باشند، نتیجه «مبهم» علامت می‌خورد و فراخوان باید از کاربر
 * بپرسد؛ این ماژول عمداً یکی را به‌زور انتخاب نمی‌کند.
 *
 * بدون وابستگی زمان‌اجرا — با `node --test` روی خروجی بیلد قابل تست است.
 */
import { SERVICE_GROUPS, STAFF_ANY_PHRASES } from "./salon-lexicon";

export type CatalogItem = { id: string; name: string };
export type CatalogCandidate = { id: string; name: string; score: number };
export type CatalogMatch = {
  id: string;
  name: string;
  score: number;
  ambiguous: boolean;
  candidates: CatalogCandidate[];
  /** صورتِ گفته‌شده‌ای که به این نتیجه رسید؛ در حالت مبهم همین به کاربر برگردانده می‌شود نه نام کاتالوگ */
  phrase: string;
};

/** زیر این امتیاز، اصلاً چیزی فهمیده نشده تلقی می‌شود */
const SERVICE_MIN_SCORE = 0.62;
const STAFF_MIN_SCORE = 0.72;
/** اختلاف کمتر از این بین نفر اول و دوم = مبهم (باید پرسیده شود) */
const TIE_DELTA = 0.035;
/** تطبیق کامل یا نزدیک به کامل، هرگز مبهم نیست */
const EXACT_SCORE = 0.995;

const LOANWORDS: Record<string, string> = {
  "hair cut": "کوتاهی مو",
  "hair color": "رنگ مو",
  "hair colour": "رنگ مو",
  "nail art": "نیل آرت",
  "make up": "میکاپ",
  "skin care": "مراقبت پوست",
  "deep tissue": "بافت عمیق",
  "full body": "فول بادی",
  "hair extension": "اکستنشن مو",
  "lash extension": "اکستنشن مژه",
  highlight: "هایلایت",
  highlights: "هایلایت",
  lowlight: "لولایت",
  balayage: "بالیاژ",
  ombre: "آمبره",
  sombre: "سامبره",
  keratin: "کراتین",
  botox: "بوتاکس",
  manicure: "مانیکور",
  pedicure: "پدیکور",
  facial: "فیشیال",
  makeup: "میکاپ",
  brushing: "براشینگ",
  blowdry: "سشوار",
  shinion: "شینیون",
  chignon: "شینیون",
  extension: "اکستنشن",
  lifting: "لیفتینگ",
  lift: "لیفت",
  laminate: "لمینت",
  laminating: "لمینت",
  wax: "وکس",
  waxing: "وکس",
  epilation: "اپیلاسیون",
  sugaring: "شوگرینگ",
  laser: "لیزر",
  massage: "ماساژ",
  spa: "اسپا",
  microblading: "میکروبلیدینگ",
  remover: "ریموو",
  remove: "ریموو",
  gelish: "ژلیش",
  polish: "لاک",
  french: "فرنچ",
  volume: "والیوم",
  classic: "کلاسیک",
  hybrid: "هیبرید",
  spike: "اسپایک",
  color: "رنگ",
  colour: "رنگ",
  cut: "کات",
  fade: "فید",
  trim: "تریم",
  beard: "ریش",
  shave: "شیو",
  hair: "مو",
  nail: "ناخن",
  nails: "ناخن",
  lash: "مژه",
  lashes: "مژه",
  brow: "ابرو",
  brows: "ابرو",
  skin: "پوست",
  face: "صورت",
  body: "بدن",
  foot: "پا",
  feet: "پا",
  hand: "دست",
  head: "سر",
  package: "پکیج",
  pack: "پکیج",
  vip: "وی آی پی",
  prp: "پی آر پی",
  rf: "آر اف",
  hifu: "هایفو",
  cavitation: "کویتیشن",
  filler: "فیلر",
  gel: "ژل",
  acne: "آکنه",
  scrub: "اسکراب",
  peeling: "لایه برداری",
  peel: "لایه برداری",
  mask: "ماسک",
  shampoo: "شامپو",
  conditioner: "نرم کننده",
  consultation: "مشاوره",
  bride: "عروس",
  bridal: "عروس",
  groom: "داماد",
  kids: "کودک",
  child: "کودک",
};

const LOANWORD_ENTRIES = Object.entries(LOANWORDS).sort((a, b) => b[0].length - a[0].length);

/** یکدست‌سازی فارسی: رقم، حروف عربی، اعراب، کشیده، نیم‌فاصله، نویسه‌های جهت و وام‌واژهٔ لاتین */
export function normalizeFa(input: string): string {
  let s = String(input ?? "");
  s = s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  s = s
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[أإٱآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/ء/g, "");
  s = s
    .replace(/[\u064B-\u0652\u0670]/g, "")
    .replace(/\u0640/g, "")
    .replace(/\u200c/g, " ")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "");
  s = s.toLowerCase();
  for (const [latin, persian] of LOANWORD_ENTRIES) {
    s = s.replace(new RegExp(`\\b${latin}\\b`, "g"), persian);
  }
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** هم‌آواها یکی می‌شوند: ژ/ج، پ/ب، ک/گ، ط/ت، ص/س، ح/ه، ق/غ … (کانال کم‌وزن‌تر) */
const PHONETIC_MAP: Record<string, string> = {
  پ: "ب",
  ژ: "ج",
  چ: "ج",
  ط: "ت",
  ص: "س",
  ث: "س",
  ح: "ه",
  ذ: "د",
  ض: "ز",
  ظ: "ز",
  غ: "ق",
  گ: "ک",
  ع: "ا",
};

function compact(s: string): string {
  return s.replace(/\s+/g, "");
}

function tokens(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

export function phoneticKey(input: string): string {
  return compact(normalizeFa(input))
    .split("")
    .map((ch) => PHONETIC_MAP[ch] ?? ch)
    .join("");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function editRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 0;
  return 1 - levenshtein(a, b) / max;
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const ca = compact(a);
  const cb = compact(b);
  if (ca === cb) return 0.98;
  if (phoneticKey(a) === phoneticKey(b)) return 0.95;
  return editRatio(ca, cb);
}

/** ضریب دایس روی واژه‌های تقریباً یکسان — ترتیب واژه‌ها مهم نیست */
function tokenDice(x: string, y: string): number {
  const a = tokens(x);
  const b = tokens(y);
  if (!a.length || !b.length) return 0;
  const weightA = a.reduce((sum, t) => sum + t.length, 0);
  const weightB = b.reduce((sum, t) => sum + t.length, 0);
  const used = new Set<number>();
  let matched = 0;
  for (const t of a) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < b.length; i += 1) {
      if (used.has(i)) continue;
      const score = tokenSimilarity(t, b[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0 && bestScore >= 0.78) {
      used.add(bestIndex);
      matched += t.length;
    }
  }
  return (2 * matched) / (weightA + weightB);
}

/** شباهت ۰..۱ دو عبارت فارسی/لاتین، بی‌توجه به غلط املایی و نیم‌فاصله */
export function similarity(a: string, b: string): number {
  const x = normalizeFa(a);
  const y = normalizeFa(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const cx = compact(x);
  const cy = compact(y);
  if (cx === cy) return 0.98;
  if (phoneticKey(x) === phoneticKey(y)) return 0.95;

  let best = 0;
  const short = cx.length <= cy.length ? cx : cy;
  const long = cx.length <= cy.length ? cy : cx;
  // «رنگ» داخل «رنگ مو»؛ ولی «مو»ی دو حرفه‌ای همه‌جا پیدا نشود
  if (short.length >= 3 && long.includes(short)) {
    best = Math.max(best, 0.6 + 0.35 * (short.length / long.length));
  }
  best = Math.max(best, tokenDice(x, y) * 0.95);
  const edit = editRatio(cx, cy);
  if (edit >= 0.55) best = Math.max(best, edit * 0.92);
  const phonetic = editRatio(phoneticKey(x), phoneticKey(y));
  if (phonetic >= 0.6) best = Math.max(best, phonetic * 0.9);
  return Math.min(1, best);
}

const NORMALIZED_GROUPS = SERVICE_GROUPS.map((group) => ({
  label: normalizeFa(group.label),
  aliases: [...new Map(
    group.aliases
      .map((alias) => normalizeFa(alias))
      .filter(Boolean)
      .map((alias) => [compact(alias), { key: compact(alias), display: alias, multi: alias.includes(" ") }])
  ).values()],
}));

const NORMALIZED_ANY_PHRASES = STAFF_ANY_PHRASES.map((phrase) => normalizeFa(phrase));

/**
 * گروه‌های واژه‌نامه‌ای که در متن دیده می‌شوند، به‌همراه طول بلندترین صورتِ منطبق.
 * اگر یک صورتِ کوتاه‌تر بخشی از صورتِ بلندتر باشد، گروه کوتاه‌تر حذف می‌شود تا
 * «کوتاهی ناخن» به‌اشتباه «کوتاهی مو» تلقی نشود. طول، میزان اختصاصی‌بودنِ قصد را
 * می‌رساند: در «میکروبلیدینگ ابرو» خودِ «میکروبلیدینگ» تعیین‌کننده است نه «ابرو».
 *
 * صورت‌های چندواژه‌ای روی رشتهٔ فشرده جست‌وجو می‌شوند (غلط فاصله‌گذاری ASR را می‌گیرد)،
 * ولی صورتِ تک‌واژه‌ای باید خودش یک واژه باشد یا دست‌کم آغازِ یک واژهٔ بلندتر؛ وگرنه
 * «تور» داخل «موتور» و «آرایش» داخل «آرایشگر» پیدا می‌شود و پکیجِ بی‌ربط ساخته می‌شود.
 */
/** ضمیرهای چسبیدهٔ فارسیِ محاوره‌ای: «ابروهامو» = ابرو + هامو، «صورتمو» = صورت + مو */
const ENCLITICS = /^(مو|هامو|هام|هایم|هایمو|هامون|هایمون|مون|تون|شون|م|ت|ش|ام|ات|اش|ها|هایی)$/;

function serviceHitsOf(text: string): { label: string; len: number; display: string }[] {
  const norm = normalizeFa(text);
  if (!norm) return [];
  const hay = compact(norm);
  const tokenList = tokens(norm).map((token) => compact(token));
  const hits: { label: string; alias: string; display: string }[] = [];
  for (const group of NORMALIZED_GROUPS) {
    for (const alias of group.aliases) {
      const found = alias.multi
        ? hay.includes(alias.key)
        : tokenList.some((token) => {
            if (token === alias.key) return true;
            if (!token.startsWith(alias.key)) return false;
            if (alias.key.length >= 6) return true;
            return alias.key.length >= 3 && ENCLITICS.test(token.slice(alias.key.length));
          });
      if (found) hits.push({ label: group.label, alias: alias.key, display: alias.display });
    }
  }
  const longest = new Map<string, { len: number; display: string }>();
  for (const hit of hits) {
    const swallowed = hits.some(
      (other) => other.label !== hit.label && other.alias.length > hit.alias.length && other.alias.includes(hit.alias)
    );
    if (swallowed) continue;
    const prev = longest.get(hit.label);
    if (!prev || hit.alias.length > prev.len) longest.set(hit.label, { len: hit.alias.length, display: hit.display });
  }
  return [...longest].map(([label, value]) => ({ label, len: value.len, display: value.display }));
}

export function serviceGroupsOf(text: string): string[] {
  return serviceHitsOf(text).map((hit) => hit.label);
}

/** آیا مشتری گفته «آرایشگر خاصی مدنظرم نیست»؟ */
export function isAnyStaffPhrase(text: string): boolean {
  const norm = normalizeFa(text);
  if (!norm) return false;
  const hay = compact(norm);
  return NORMALIZED_ANY_PHRASES.some((phrase) => hay.includes(compact(phrase)));
}

function rank(scored: (CatalogCandidate & { phrase?: string })[], minScore: number): CatalogMatch | null {
  if (!scored.length) return null;
  const ordered = [...scored].sort((a, b) => b.score - a.score);
  const top = ordered[0];
  if (top.score < minScore) return null;
  const candidates = ordered.filter((c) => c.score >= top.score - TIE_DELTA);
  const ambiguous = top.score < EXACT_SCORE && candidates.length > 1;
  return {
    id: top.id,
    name: top.name,
    score: top.score,
    ambiguous,
    candidates: ambiguous ? candidates.map(({ id, name, score }) => ({ id, name, score })) : [],
    phrase: top.phrase ?? "",
  };
}

/** چه سهمی از واژه‌های اختصاصیِ نام کاتالوگ عیناً در گفتار مشتری آمده است */
function literalOverlap(spokenNorm: string, nameNorm: string): number {
  const hay = compact(spokenNorm);
  const said = new Set(tokens(spokenNorm).map((token) => compact(token)));
  const distinctive = tokens(nameNorm)
    .map((token) => compact(token))
    .filter((token) => token.length >= 4);
  if (!distinctive.length) return 0;
  const seen = distinctive.filter((token) => said.has(token) || (token.length >= 5 && hay.includes(token)));
  return seen.length / distinctive.length;
}

/**
 * تطبیق پکیج/خدمتِ گفته‌شده با خدمات سالن.
 * خروجی null یعنی «چیزی فهمیده نشد»؛ ambiguous یعنی «چند گزینه هم‌امتیاز است، بپرس».
 */
export function matchService(text: string, items: CatalogItem[]): CatalogMatch | null {
  const spoken = normalizeFa(text);
  if (!spoken || !items?.length) return null;
  const spokenHits = serviceHitsOf(spoken);
  const longest = spokenHits.reduce((max, hit) => Math.max(max, hit.len), 1);
  const phrase = spokenHits.length
    ? spokenHits.reduce((best, hit) => (hit.len > best.len ? hit : best)).display
    : String(text ?? "").trim();
  const scored = items.map((item) => {
    const name = normalizeFa(item.name);
    let score = similarity(spoken, name);
    if (spokenHits.length && name) {
      const itemHits = serviceHitsOf(name);
      const itemLabels = new Set(itemHits.map((hit) => hit.label));
      const shared = spokenHits.filter((hit) => itemLabels.has(hit.label));
      if (shared.length > 0) {
        const specificity = shared.reduce((max, hit) => Math.max(max, hit.len), 0) / longest;
        const coverage = shared.length / Math.max(spokenHits.length, itemHits.length);
        // هم‌گروه بودن کافی نیست: «پاکسازی پوست» و «میکرودرم ابریژن» یک گروه‌اند،
        // ولی وقتی مشتری عیناً «پاکسازی» گفته، نامی که همان واژه را دارد باید برنده شود.
        const literal = literalOverlap(spoken, name);
        score = Math.max(score, 0.74 + 0.12 * specificity + 0.02 * coverage + 0.1 * literal);
      }
    }
    return { id: item.id, name: item.name, score, phrase };
  });
  const result = rank(scored, SERVICE_MIN_SCORE);
  if (!result) return null;

  // عبارتِ کوتاهِ گفته‌شده اگر داخل نام چند پکیج جا بگیرد، قصد مشتری کامل نیست:
  // «لمینت» هم به «لمینت مژه» می‌خورد هم «لیفت و لمینت ابرو» → باید پرسیده شود.
  const generic = compact(normalizeFa(phrase));
  if (generic.length >= 3) {
    const keys = scored.map((c) => ({ candidate: c, key: compact(normalizeFa(c.name)) }));
    const exact = keys.some(({ candidate, key }) => key === generic && candidate.score >= EXACT_SCORE);
    if (!exact) {
      const fitting = keys
        .filter(({ key }) => key.length > generic.length && key.includes(generic))
        .map(({ candidate }) => ({ id: candidate.id, name: candidate.name, score: similarity(phrase, candidate.name) }))
        .sort((a, b) => b.score - a.score);
      if (fitting.length > 1) {
        return { ...result, ambiguous: true, candidates: fitting };
      }
    }
  }
  return result;
}

/** نشانه‌هایی که می‌گویند واژهٔ بعدی نام آرایشگر است، نه نام مشتری */
const STAFF_CUES = new Set(
  ["آرایشگر", "آرایشگرش", "آرایشگرمان", "خانم", "آقای", "استاد", "توسط"].map((cue) => compact(normalizeFa(cue)))
);

/**
 * تطبیق نام آرایشگرِ گفته‌شده با پرسنل سالن (اختیاری).
 * `exclude` نام خودِ مشتری است تا «به نام سارا احمدی» با آرایشگری به نام سارا اشتباه نشود.
 * اگر مشتری صریحاً «آرایشگر مریم» بگوید، همان نشان بر نامِ بدونِ نشان («سارا احمدی»)
 * اولویت دارد؛ حتی وقتی پارسر نام مشتری را جدا نکرده باشد.
 */
export function matchStaff(text: string, items: CatalogItem[], opts?: { exclude?: string[] }): CatalogMatch | null {
  if (!items?.length) return null;
  let norm = normalizeFa(text);
  for (const excluded of opts?.exclude ?? []) {
    const value = normalizeFa(excluded);
    if (value.length >= 3) norm = norm.split(value).join(" ");
  }
  norm = norm.replace(/\s+/g, " ").trim();
  if (!norm) return null;

  const said = tokens(norm).slice(0, 60);
  const cuedAt = (index: number) => index > 0 && STAFF_CUES.has(compact(said[index - 1]));
  const windows: { text: string; cued: boolean }[] = [];
  for (let size = 1; size <= Math.min(said.length, 4); size += 1) {
    for (let i = 0; i + size <= said.length; i += 1) {
      windows.push({ text: said.slice(i, i + size).join(" "), cued: cuedAt(i) });
    }
  }

  const scored = items.map((item) => {
    const name = normalizeFa(item.name);
    let score = 0;
    let cuedScore = 0;
    let phrase = "";
    for (const window of windows) {
      const value = similarity(window.text, name);
      if (value > score) {
        score = value;
        phrase = window.text;
      }
      if (window.cued) cuedScore = Math.max(cuedScore, value);
    }
    // فقط نام کوچک یا فقط نام خانوادگی هم پذیرفته می‌شود (با امتیاز کمتر)
    for (const part of tokens(name)) {
      if (compact(part).length < 3) continue;
      const index = said.findIndex((token) => tokenSimilarity(token, part) >= 0.9);
      if (index < 0) continue;
      const value = cuedAt(index) ? 0.96 : 0.84;
      if (value > score) {
        score = value;
        phrase = said[index];
      }
      if (cuedAt(index)) cuedScore = Math.max(cuedScore, value);
    }
    if (cuedScore > 0) score = Math.max(score, Math.min(1, cuedScore + 0.12));
    return { id: item.id, name: item.name, score, phrase };
  });
  return rank(scored, STAFF_MIN_SCORE);
}