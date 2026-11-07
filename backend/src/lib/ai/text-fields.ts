/**
 * استخراج نام مشتری از متن فارسی — ماژول خالص (بدون هیچ وابستگی زمان‌اجرا) تا
 * با `node --test` قابل تست باشد و هم برای گفتار ضبط‌شده و هم جملهٔ تایپ‌شده یکی برود.
 *
 * رزرو در پنل را آرایشگر برای مشتری ثبت می‌کند، پس عبارت «به نام سارا احمدی» را هم
 * مثل «اسم من سارا است» باید شناخت.
 *
 * نکتهٔ مهم دربارهٔ ASR فارسی: خروجی مدل تقریباً همیشه «گفتاری» است و
 * «اسمم»/«اسممه»/«است» را هم به نام می‌چسباند:
 *   «زهرا امیرابراهیمی اسممه»  →  زهرا امیرابراهیمی
 *   «اسمم علیرضااست …»         →  علیرضا
 * برای همین علاوه بر الگوهای متنی، از فهرست نام‌ها (names-fa.ts) هم استفاده
 * می‌شود تا مرز نام پیدا شود و کلمه‌های معمولی («کوتاهی مو»، «فردا») نام نشوند.
 */
import {
  isKnownFirstName,
  isKnownSurname,
  isNameFiller,
  isNameIntro,
  isNameTitle,
  normalizeNameWord,
  stripNameSuffix,
} from "./names-fa";

const PERSIAN_WORD_RE = /[\u0621-\u063A\u0641-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC\u200c]+/g;

const MAX_NAME_WORDS = 3;

/** پاک‌سازی سادهٔ یک عبارت نام (برای مصرف‌کننده‌های قدیمی حفظ شده است). */
export function trimPersianName(raw: string): string {
  const tokens = raw.replace(/[،,.;:!?«”"()[\]]+/g, " ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const token of tokens) {
    const word = stripNameSuffix(token);
    const norm = normalizeNameWord(word);
    if (!norm) continue;
    if (out.length === 0 && (isNameFiller(norm) || isNameTitle(norm))) continue;
    if (isNameFiller(norm) || isNameTitle(norm)) break;
    out.push(word);
    if (out.length >= MAX_NAME_WORDS) break;
  }
  return out.join(" ").trim();
}

/** آیا بعد از این اندیس، واژهٔ قابل‌توجهی (غیر filler/عنوان) هست؟ */
function hasNameContentAfter(tokens: string[], index: number): boolean {
  for (let i = index + 1; i < tokens.length; i++) {
    const norm = normalizeNameWord(stripNameSuffix(tokens[i]));
    if (norm && !isNameFiller(norm) && !isNameTitle(norm)) return true;
  }
  return false;
}

/**
 * نام مشتری را از متن بیرون می‌کشد.
 *
 * `permissive` فقط برای حالت «پرسش مجدد فیلد نام» است: مشتری تنها اسمش را
 * می‌گوید و ممکن است نامش در فهرست نباشد؛ در این حالت یک پاسخ کوتاه بدون
 * کلمهٔ راهنما هم پذیرفته می‌شود. در متن کاملِ گفتار، تشخیص سخت‌گیرانه است تا
 * «کوتاهی مو» یا روز هفته به‌جای نام ثبت نشود.
 */
export function extractNameFromText(text: string, opts: { permissive?: boolean } = {}): string | undefined {
  const tokens = text.match(PERSIAN_WORD_RE) ?? [];
  if (!tokens.length) return undefined;

  const permissive = opts.permissive === true;
  let start = -1;
  let viaIntro = false;

  // ۱) شروع بعد از عبارت معرفی: «اسمم …»، «اسم من …»، «به نام …»
  for (let i = 0; i < tokens.length; i++) {
    const norm = normalizeNameWord(tokens[i]);
    if (isNameIntro(norm) && hasNameContentAfter(tokens, i)) {
      start = i + 1;
      viaIntro = true;
      break;
    }
    // «من زهرا هستم» / «منم زهرا»
    if ((norm === "من" || norm === "منم") && i + 1 < tokens.length) {
      const next = stripNameSuffix(tokens[i + 1]);
      if (isKnownFirstName(next) || isKnownSurname(next)) {
        start = i + 1;
        viaIntro = true;
        break;
      }
    }
  }

  // ۲) بدون معرفی: اولین نام شناخته‌شده که در جای طبیعی جمله آمده است
  if (start < 0) {
    for (let i = 0; i < tokens.length; i++) {
      const word = stripNameSuffix(tokens[i]);
      if (!isKnownFirstName(word) && !(permissive && isKnownSurname(word))) continue;
      const prev = i > 0 ? normalizeNameWord(tokens[i - 1]) : "";
      const naturalStart =
        i === 0 || !prev || isNameFiller(prev) || isNameTitle(prev) || permissive;
      if (naturalStart) {
        start = i;
        break;
      }
    }
  }

  // ۳) آخرین راه: پاسخ کوتاهِ فقط-نام (نام نادر/خارجی)
  if (start < 0 && permissive) {
    start = tokens.findIndex((token) => {
      const norm = normalizeNameWord(stripNameSuffix(token));
      return norm.length >= 2 && !isNameFiller(norm) && !isNameTitle(norm);
    });
  }
  if (start < 0) return undefined;

  // ۴) جمع‌آوری نام تا filler/عنوان/پایان جمله
  const out: string[] = [];
  for (let i = start; i < tokens.length && out.length < MAX_NAME_WORDS; i++) {
    const word = stripNameSuffix(tokens[i]);
    const norm = normalizeNameWord(word);
    if (!norm) continue;

    const filler = isNameFiller(norm) || isNameTitle(norm);
    if (filler) {
      // fillerهای ابتدای بازه (مثل «من» در «اسم من سارا») رد می‌شوند
      if (out.length === 0) continue;
      break;
    }

    if (out.length === 0) {
      // در متن کامل، کلمهٔ اول باید نام شناخته‌شده باشد (مگر بعد از معرفی).
      if (!viaIntro && !permissive && !isKnownFirstName(norm) && !isKnownSurname(norm)) {
        return undefined;
      }
    } else {
      // واژهٔ دوم/سوم: اگر در فهرست نیست، فقط وقتی بپذیر که نشانهٔ پایان نام
      // (filler/عنوان/انتهای متن) بلافاصله بعدش باشد؛ «زهرا کوتاهی مو» یعنی
      // «کوتاهی» فامیل نیست، ولی «زهرا امیرابراهیمی هستم» یعنی هست.
      const known = isKnownFirstName(norm) || isKnownSurname(norm);
      if (!known && !viaIntro && !permissive) {
        const nextNorm =
          i + 1 < tokens.length ? normalizeNameWord(stripNameSuffix(tokens[i + 1])) : "";
        const nextIsBoundary =
          i + 1 >= tokens.length ||
          !nextNorm ||
          isNameFiller(nextNorm) ||
          isNameTitle(nextNorm);
        if (!nextIsBoundary) break;
      }
    }

    out.push(word);
  }

  if (!out.length) return undefined;
  const name = out.join(" ").trim();
  return name.length >= 3 ? name : undefined;
}
