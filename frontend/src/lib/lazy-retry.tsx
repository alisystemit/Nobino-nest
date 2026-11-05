/**
 * بارگذاری تنبل با بازیابی خودکار + حائل خطا (U3).
 *
 * صفحهٔ عمومی سالن با `lazy()` بارگذاری می‌شود و هیچ حائل خطایی نداشت: اگر چانک
 * `assets/*.js` بخورد (لحظهٔ بازگردانی، اینترنت قطع، نامش سازگار با بیلد قبلی)
 * مشتری تا ابد اسکلت «در حال بارگذاری…» می‌دید. اینجا سه کار انجام می‌شود:
 *  ۱) `importWithRetry`: تلاش مجدد با فاصلهٔ کوتاه؛
 *  ۲) حائل خطا: به‌جای اسکلت بی‌پایان، کارت خطا با دکمهٔ «تلاش دوباره»؛
 *  ۳) بازیابی خودکار: اولین بار که چانک می‌خورد، صفحه یک بار خودش رفرش می‌شود.
 *
 * چرا (۳) لازست و (۱) به‌تنهایی نه — آزموده شد: مرورگر آدرس یک ماژولِ دانلودش‌نشدنی
 * را در «گراف ماژول» همان سند علامت می‌زند، پس `import()` بعدیِ همان URL دیگر به
 * شبکه نمی‌رود و بی‌درنگ رد می‌شود (در تست زنده با پروکسی که درخواست اول چانک را
 * ۵۰۰ کرد، دقیقاً یک درخواست به سرور رسید و بقیهٔ تلاش‌ها محلی رد شدند). راه‌حل
 * واقعی، سند تازه است: `location.reload()` — که با درِ sessionStorage جلوی حلقهٔ
 * رفرش گرفته شده است.
 */
import { Component, lazy, type ComponentType, type ReactNode } from "react";

const RETRY_DELAYS_MS = [400, 1200];
/** کلید و پنجرهٔ زمانی «یک بار رفرش خودکار» — جلوی حلقهٔ بی‌پایان رفرش را می‌گیرد */
const AUTO_RELOAD_KEY = "nobino.chunkReloadAt";
const AUTO_RELOAD_COOLDOWN_MS = 60_000;

function takeAutoReloadTicket(): boolean {
  try {
    const last = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) ?? 0);
    if (last && Date.now() - last < AUTO_RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    // sessionStorage (حالت خصوصی/بی‌دیسک) → رفرش خودکار نمی‌کنیم، کارت خطا می‌ماند
    return false;
  }
}

/** `import()` را با تلاش‌های پشت‌سرهم اجرا می‌کند؛ خطای آخرین تلاش را پرت می‌کند */
export async function importWithRetry<T>(factory: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const delay of [0, ...RETRY_DELAYS_MS]) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      return await factory();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** معادل `lazy()` ولی با تلاش دوبارهٔ خودکار برای دانلود چانک */
export function lazyWithRetry<E extends object>(factory: () => Promise<{ default: ComponentType<E> }>) {
  return lazy(() => importWithRetry(factory));
}

/** آیا خطا از دانلود چانک است؟ (برای رفرش خودکار فقط همین‌ها را می‌پذیریم) */
function isChunkError(err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err ?? "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|error loading dynamically/i.test(msg);
}

type BoundaryProps = { children: ReactNode; title?: string; hint?: string };
type BoundaryState = { error: unknown };

/** حائل خطای React برای چانک/کامپوننت تنبل — اسکلت بی‌پایان نمی‌دهد */
export class ChunkErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown) {
    // خطای چانک در سند فعلی قابل بازگردانی نیست (گراف ماژول آن URL را خراب نشان
    // می‌دهد)، پس یک بار سند را از نو بارگذاری می‌کنیم. درِ ۶۰ ثانیه‌ای نگهبان حلقه است.
    if (isChunkError(error) && takeAutoReloadTicket()) {
      window.setTimeout(() => window.location.reload(), 250);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="mx-auto flex min-h-[45vh] max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
          <div className="text-4xl">📡</div>
          <h1 className="text-xl font-black text-neutral-900 dark:text-neutral-100">{this.props.title ?? "صفحه باز نشد"}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {this.props.hint ?? "دانلود بخش‌های این صفحه کامل نشد؛ اگر تازه نسخهٔ سایت عوض شده، یک بار صفحه را دوباره باز کنید."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-pink-500"
          >
            تلاش دوباره
          </button>
          <a href="/salons" className="text-sm font-bold text-neutral-500 underline-offset-4 hover:underline">
            مشاهده فهرست سالن‌ها
          </a>
        </main>
      );
    }
    return this.props.children;
  }
}
