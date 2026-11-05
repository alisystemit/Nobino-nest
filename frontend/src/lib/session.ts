/**
 * پروب مشترک «من کیستم؟» (C17 / U5).
 *
 * در هر بار بارگذاری صفحه، چهار تا پنج کامپوننت مستقل همان `GET /api/auth/me` را
 * می‌زدند: `AuthProvider`، سربرگ سایت، پوستهٔ داشبورد و خودِ صفحه. نتیجه: ترافیک
 * تکراری و شلوغی کنسول. این لایه هر درخواستِ **در حال اجرا** را یکی می‌کند — یعنی
 * همهٔ فراخوان‌های هم‌زمان یک `fetch` مشترک را می‌گیرند، ولی درخواست بعدی (مثلاً
 * بعد از ورود یا خروج) دوباره واقعاً از سرور می‌خواند و مقدار کهنه نمی‌دهد.
 */
export type MeResult = { user: any | null; status: number };

let inflight: Promise<MeResult> | null = null;

export function fetchMe(): Promise<MeResult> {
  if (inflight) return inflight;
  const run = (async (): Promise<MeResult> => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      const data = await res.json().catch(() => null);
      return { user: data?.user ?? null, status: res.status };
    } catch {
      // قطعی شبکه «ناشناس» نیست ولی برای رابط کاربری همان بی‌نشستی است
      return { user: null, status: 0 };
    }
  })();
  inflight = run;
  run.finally(() => {
    if (inflight === run) inflight = null;
  });
  return run;
}
