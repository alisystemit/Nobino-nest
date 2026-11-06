import { httpError } from "@/lib/utils";

/**
 * ابزار مشترک «پول» (تومان).
 *
 * ستون‌های مالی پروژه در Prisma از نوع `BigInt` هستند که در PostgreSQL به
 * `bigint` (۸ بایت) نگاشت می‌شود. مقدار تومانی در برنامه همیشه به‌صورت
 * `number` جا‌به‌جا می‌شود (چون از `Number.MAX_SAFE_INTEGER` فاصلهٔ زیادی
 * دارد) و فقط در مرز پایگاه‌داده به `bigint` تبدیل می‌شود:
 *
 *   نوشتن:  `asBigInt(amount)` / `asBigIntOrNull(value)`
 *   خواندن: `asNumber(row.amount)` / `asNumberOrNull(row.originalAmount)`
 *
 * قاعده‌ها:
 *   - فقط عدد صحیح امن (safe integer) پذیرفته می‌شود
 *   - NaN / Infinity / اعشار / رشته به‌جای عدد رد می‌شوند
 *   - پیام خطا فارسی و قابل‌نمایش به کاربر است (۴۰۰، نه ۵۰۰)
 *
 * `MONEY_INT_MAX` سقف قدیمیِ ستون `Int` بود؛ حالا فقط به‌عنوان سقف سیاستی
 * (نه محدودیت پایگاه‌داده) نگه داشته شده تا اعداد غیرواقعی رد شوند.
 */
export const MONEY_INT_MAX = 2_147_483_647;

/** اگر مقدار برای ذخیره در ستون مالی معتبر نباشد، پیام فارسی برمی‌گرداند */
export function moneyIssue(value: unknown, label = "مبلغ"): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return `${label} باید یک عدد معتبر باشد`;
  if (!Number.isInteger(value)) return `${label} باید عدد صحیح (بدون اعشار) باشد`;
  if (!Number.isSafeInteger(value)) return `${label} از محدودهٔ عددی مجاز خارج است`;
  if (Math.abs(value) > MONEY_INT_MAX) {
    return `${label} نمی‌تواند بیشتر از ${MONEY_INT_MAX.toLocaleString("fa-IR")} تومان باشد`;
  }
  return null;
}

/** همان بررسی، با پرتاب خطای ۴۰۰ (برای استفاده در مسیرهای API و سرویس‌ها) */
export function assertMoney(value: number, label = "مبلغ"): number {
  const issue = moneyIssue(value, label);
  if (issue) throw httpError(issue, 400);
  return value;
}

/** مبلغ باید عدد صحیح مثبت باشد (فاکتور، پرداخت، واریز کیف پول) */
export function assertPositiveMoney(value: number, label = "مبلغ"): number {
  assertMoney(value, label);
  if (value <= 0) throw httpError(`${label} باید بزرگ‌تر از صفر باشد`, 400);
  return value;
}

/**
 * `bigint` پایگاه‌داده → `number` برنامه.
 * اگر مقدار از محدودهٔ امن `number` بیرون باشد، به‌جای گم‌شدن دقت، خطا می‌دهد.
 */
export function asNumber(value: bigint | number): number {
  if (typeof value === "number") return value;
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("مقدار مالی از محدودهٔ مجاز عددی خارج است");
  }
  return Number(value);
}

/** همان تبدیل، با حفظ `null` (برای ستون‌های اختیاری مثل originalAmount) */
export function asNumberOrNull(value: bigint | number | null | undefined): number | null {
  return value == null ? null : asNumber(value);
}

/**
 * `number` برنامه → `bigint` پایگاه‌داده.
 * مقدار باید صحیح و در محدودهٔ امن باشد؛ در غیر این صورت خطای ۴۰۰.
 */
export function asBigInt(value: number | bigint, label = "مبلغ"): bigint {
  if (typeof value === "bigint") return value;
  const issue = moneyIssue(value, label);
  if (issue) throw httpError(issue, 400);
  return BigInt(value);
}

/** همان تبدیل، با حفظ `null` */
export function asBigIntOrNull(value: number | bigint | null | undefined, label = "مبلغ"): bigint | null {
  return value == null ? null : asBigInt(value, label);
}

/**
 * Replacer مخصوص `JSON.stringify` برای پاسخ‌های API.
 * قرارداد API همان `number` تومان می‌ماند (فرانت تغییری لازم ندارد) و هیچ
 * مسیری به‌خاطر `BigInt` خطای «Do not know how to serialize a BigInt» نمی‌دهد.
 */
export function bigintJsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? Number(value) : value;
}
