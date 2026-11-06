/**
 * ابزارهای کمکی مشترک سمت سرور.
 * (ترکیب کلاس‌های Tailwind کارِ کلاینت است — `frontend/src/lib/utils.ts` را ببینید.)
 */

/**
 * پارسر صفحه‌بندی سمت سرور.
 * پارامترهای `page` و `limit` را از URL می‌خواند و مقادیر امن برمی‌گرداند.
 * خروجی مستقیماً برای `skip`/`take` در Prisma قابل استفاده است.
 */
export function getPagination(url: string | URL, defaultLimit = 25, maxLimit = 200) {
  const u = typeof url === "string" ? new URL(url) : url;
  const page = Math.max(1, parseInt(u.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(u.searchParams.get("limit") || String(defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

/**
 * خطای HTTP با کد وضعیت.
 * در لایهٔ منطق تجاری پرتاب می‌شود و `apiError` آن را به پاسخ JSON نگاشت می‌کند.
 */
export function httpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/** پاسخ JSON استاندارد برای Route Handlers */
export function json(data: unknown, init?: ResponseInit) {
  // `JSON.stringify` روی `BigInt` خطا می‌دهد؛ ستون‌های مالی Prisma حالا
  // BigInt هستند. قرارداد API همان number تومان می‌ماند (امن، چون مبالغ
  // واقعی بسیار کوچک‌تر از 2^53 هستند).
  return new Response(JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? Number(value) : value)), {
    ...init,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

/**
 * خطاهای کنترلی redirect/not-found.
 * این خطاها نشانهٔ «این مسیر داینامیک است» هستند و نباید به پاسخ JSON تبدیل
 * شوند؛ باید دوباره پرتاب شوند تا رندر به زمان درخواست موکول شود.
 * بلعیدن آن‌ها باعث شکست رندر می‌شود.
 */
export function isControlledError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest === "HANGING_PROMISE_REJECTION" ||
    digest === "DYNAMIC_CODE_USAGE" ||
    digest === "C_ERR_REDIRECT" ||
    digest === "C_ERR_NOT_FOUND" ||
    digest === "CLIENT_HOOK_DYNAMIC"
  );
}

export function apiError(error: unknown) {
  // خطاهای کنترلی redirect/not-found را دوباره پرتاب می‌کنیم (تبدیلشان به Response غلط است)
  if (isControlledError(error)) throw error;
  // خطاهای اعتبارسنجی Zod را به 400 نگاشت می‌کنیم
  let status = (error as { status?: number })?.status ?? 500;
  let message = error instanceof Error ? error.message : "خطای ناشناخته";
  const zod = (error as { name?: string; issues?: unknown }).name;
  if (zod === "ZodError") {
    status = 400;
    try {
      const issues = (error as { issues: { message: string }[] }).issues;
      message = issues.map((i) => i.message).join("؛ ");
    } catch {
      /* ignore */
    }
  }
  // C16: متن خام Prisma («Unique constraint failed on the fields …») هرگز نباید
  // به مشتری برسد؛ کد خطا به پیام فارسی و وضعیت مناسب نگاشت می‌شود.
  if (typeof zod === "string" && zod.startsWith("PrismaClient")) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      status = 409;
      message = "این اطلاعات قبلاً ثبت شده است؛ لازم نیست دوباره تلاش کنید.";
    } else if (code === "P2025") {
      status = 404;
      message = "رکورد موردنظر دیگر وجود ندارد.";
    } else if (code === "P2003") {
      status = 400;
      message = "دادهٔ مرتبط با این رکورد پیدا نشد.";
    } else {
      status = 500;
      message = "خطای داخلی در ثبت اطلاعات رخ داد؛ کمی بعد دوباره تلاش کنید.";
    }
  }
  // ثبت خطاهای سرور برای پایش (گزارش خطا)
  if (status >= 500) {
    import("@/lib/monitoring").then((m) => m.reportError(error, { status })).catch(() => {});
  }
  return json({ success: false, error: message }, { status });
}

/** تبدیل عدد به فرمت تومان با جداکننده هزارگان */
export function formatToman(amount: number): string {
  return new Intl.NumberFormat("fa-IR").format(amount) + " تومان";
}

/** تبدیل تاریخ به شمسی (فقط نمایش) */
export function toJalali(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export function toPersianDigits(input: string | number): string {
  const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(input).replace(/\d/g, (d) => fa[Number(d)]);
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * ارقام فارسی و عربی(هندی) را به ASCII تبدیل می‌کند.
 * `\d` در جاوااسکریپت فقط رقم انگلیسی را می‌شناسد، پس هر `replace(/\D/g,"")`
 * یا `Number()` روی ورودی کیبورد فارسی، رشته را خالی و عدد را **صفر** می‌کند.
 * همه‌جایی که کاربر عدد تایپ می‌کند باید اول از این عبور کند.
 */
export function toAsciiDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

export type NumInput = { ok: true; value: number } | { ok: false; error: string };

/**
 * عدد صحیح از ورودی متنی/عددی کاربر، با تشخیص «چیزی نگفته» از «صفر گفته».
 * `Number("")` برابر صفر است؛ این تابع آن تله را می‌شکند و رشتهٔ بدون رقم
 * را خطا می‌داند نه صفر.
 */
export function parseIntInput(raw: unknown, label: string, opts: { min?: number; max?: number } = {}): NumInput {
  const min = opts.min ?? 0;
  const max = opts.max ?? 1_000_000_000;
  if (raw === null || raw === undefined || raw === "") return { ok: false, error: `مقدار «${label}» را وارد کنید.` };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: `مقدار «${label}» عدد معتبر نیست.` };
    if (!Number.isInteger(raw)) return { ok: false, error: `مقدار «${label}» باید عدد صحیح باشد.` };
    if (raw < min || raw > max) return { ok: false, error: `مقدار «${label}» باید بین ${min.toLocaleString("en-US")} و ${max.toLocaleString("en-US")} باشد.` };
    return { ok: true, value: raw };
  }
  const cleaned = toAsciiDigits(raw as string | number).replace(/[^\d-]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return { ok: false, error: `مقدار «${label}» عدد معتبر نیست.` };
  const n = Number(cleaned);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, error: `مقدار «${label}» باید عدد صحیح باشد.` };
  if (n < min || n > max) return { ok: false, error: `مقدار «${label}» باید بین ${min.toLocaleString("en-US")} و ${max.toLocaleString("en-US")} باشد.` };
  return { ok: true, value: n };
}

/**
 * پارامتر enum از query string با اعتبارسنجی.
 * مقدار ناشناخته باید `400` بگیرد، نه `500` (خطای خام Prisma) و نه «بی‌فیلتر»؛
 * هر دو رفتار در پنل ادمین گزارش شده بود.
 */
export function enumQueryParam<T extends string>(url: string | URL, name: string, allowed: readonly T[], opts: { label?: string } = {}): T | undefined {
  const u = typeof url === "string" ? new URL(url) : url;
  const raw = u.searchParams.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const value = raw.trim().toUpperCase() as T;
  if (!allowed.includes(value)) {
    throw httpError(`مقدار «${opts.label ?? name}» نامعتبر است. مجاز: ${allowed.join("، ")}`, 400);
  }
  return value;
}

/** پارامتر بلئانی از query string؛ هر مقدار غیر از true/false باید 400 بگیرد */
export function boolQueryParam(url: string | URL, name: string, opts: { label?: string } = {}): boolean | undefined {
  const u = typeof url === "string" ? new URL(url) : url;
  const raw = u.searchParams.get(name);
  if (raw === null || raw.trim() === "") return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  throw httpError(`مقدار «${opts.label ?? name}» باید بله یا خیر (true/false) باشد.`, 400);
}

/**
 * نام پارامترهای query string را با فهرست مجاز مقایسه می‌کند.
 * یافتهٔ A16: فیلترِ ناشناخته بی‌صدا دور ریخته می‌شد و ادمین «فیلترشده» را
 * «همهٔ رکوردها» می‌دید. حالا پارامتر پشتیبانی‌نشده همان‌جا 400 می‌گیرد.
 */
export function assertKnownQueryParams(url: string | URL, allowed: readonly string[]) {
  const u = typeof url === "string" ? new URL(url) : url;
  const unknown = [...new Set([...u.searchParams.keys()])].filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw httpError(`پارامتر ناشناخته: ${unknown.join("، ")}. فیلترهای مجاز: ${allowed.join("، ")}`, 400);
  }
}
