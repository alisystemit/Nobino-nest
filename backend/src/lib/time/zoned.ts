/**
 * تبدیل تاریخ/ساعت «وال‌کلوک سالن» به لحظهٔ UTC — ماژول خالص (بدون وابستگی) تا هم در
 * مرورگر و هم با `node --test` قابل اجرا باشد.
 *
 * چرا لازم است: ساعت کاری و منطقهٔ زمانی سالن (`Salon.timezone`، پیش‌فرض Asia/Tehran) در
 * سرار اپ مبنای محاسبهٔ آزادی زمان است. اگر لحظهٔ نوبت با منطقهٔ زمانی *مرورگر* ساخته شود،
 * برای هر کاربری که ساعت ویندوز/موبایلش با سالن فرق دارد، نوبت چند ساعت جابه‌جا می‌شود و
 * سرور با پیام «زمان انتخابی خارج از ساعات کاری سالن است» ردش می‌کند.
 */

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** بخش‌های ساعت/تاریخِ `timeZone` در لحظهٔ `epochMs` (برگشت: NaN اگر منطقهٔ زمانی نامعتبر بود) */
function wallParts(epochMs: number, timeZone: string): number[] | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(epochMs));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? NaN);
    const [y, mo, d, h, mi, s] = [
      get("year"),
      get("month"),
      get("day"),
      get("hour"),
      get("minute"),
      get("second"),
    ];
    if ([y, mo, d, h, mi, s].some((n) => Number.isNaN(n))) return null;
    return [y, mo, d, h % 24, mi, s];
  } catch {
    return null;
  }
}

/** اختلاف وال‌کلوک `timeZone` با UTC در لحظهٔ داده‌شده (میلی‌ثانیه) */
function zoneOffsetMs(epochMs: number, timeZone: string): number | null {
  const p = wallParts(epochMs, timeZone);
  if (!p) return null;
  const [y, mo, d, h, mi, s] = p;
  return Date.UTC(y, mo - 1, d, h, mi, s) - epochMs;
}

/** ارقام فارسی/عربی به لاتین — کاربر می‌تواند ساعت را با کیبورد فارسی تایپ کند */
function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/** آخرین لنگر: منطقهٔ زمانی مرورگر (رفتار قدیم)، و اگر ورودی واقعاً بی‌معنی بود خطای فارسی */
function localFallback(date: string, time: string): string {
  const d = new Date(`${toLatinDigits(date.trim())}T${toLatinDigits(time.trim())}:00`);
  if (Number.isNaN(d.getTime())) throw new Error("تاریخ یا ساعت نامعتبر است؛ دوباره وارد کنید.");
  return d.toISOString();
}

/**
 * لحظهٔ UTC که در `timeZone` همان `${date}T${time}` است.
 * ورودی‌ها: `date` به شکل YYYY-MM-DD و `time` به شکل HH:MM (دقیقه اختیاری).
 * اگر منطقهٔ زمانی نامعتبر باشد، رفتار قدیم (منطقهٔ زمانی مرورگر) حفظ می‌شود.
 */
export function zonedTimeToIso(date: string, time: string, timeZone?: string | null): string {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toLatinDigits(date.trim()));
  const tm = /^(\d{1,2})(?::(\d{2}))?$/.exec(toLatinDigits(time.trim()));
  if (!dm || !tm) return localFallback(date, time);
  const [, ys, mos, ds] = dm;
  const hour = Number(tm[1]);
  const minute = tm[2] === undefined ? 0 : Number(tm[2]);
  if (hour > 23 || minute > 59) return localFallback(date, time);

  const targetUtc = Date.UTC(Number(ys), Number(mos) - 1, Number(ds), hour, minute);
  if (!timeZone) return localFallback(date, time);

  // دو بار تخمین: بار دوم اصلاح ساعت تابستانی (در ایران فعلاً تغییر نمی‌کند ولی بی‌خطر است)
  const first = zoneOffsetMs(targetUtc, timeZone);
  if (first === null) return localFallback(date, time);
  const guess = targetUtc - first;
  const second = zoneOffsetMs(guess, timeZone);
  const instant = second === null ? guess : targetUtc - second;
  return new Date(instant).toISOString();
}

/** تاریخ امروز در منطقهٔ زمانی سالن (به شکل YYYY-MM-DD) — برای `min` فیلد تاریخ */
export function todayInZone(timeZone?: string | null): string {
  const p = timeZone ? wallParts(Date.now(), timeZone) : null;
  if (p) {
    const [y, mo, d] = p;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  return new Date().toISOString().slice(0, 10);
}
