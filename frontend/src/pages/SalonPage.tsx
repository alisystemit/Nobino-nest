/**
 * صفحهٔ عمومی سالن — پوستهٔ سبکِ مسیر /s/:slug و ریشهٔ ساب‌دامین (App.tsx).
 *
 * خودِ تجربهٔ بازطراحی‌شده در `@/salon/SalonExperience` است و تنبل (lazy) بارگذاری
 * می‌شود: CSS و اجزای مینی‌اپ فقط وقتی دانلود می‌شوند که کاربر واقعاً صفحهٔ سالن
 * را باز کرده باشد، پس چانک اولیهٔ سایت بزرگ نمی‌شود و ماژول /mini هم دست‌نخورده
 * می‌ماند.
 */
import { lazy, Suspense } from "react";
import { useParamsTyped } from "@/router-shim";

const SalonExperience = lazy(() => import("@/salon/SalonExperience"));

/** جایگزین حین دانلود چانک صفحهٔ سالن */
function Skeleton() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <div className="h-32 animate-pulse rounded-3xl bg-neutral-200/70 dark:bg-neutral-800/70" />
      <div className="mt-4 space-y-3">
        <div className="h-16 animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-neutral-800/70" />
        <div className="h-24 animate-pulse rounded-2xl bg-neutral-200/70 dark:bg-neutral-800/70" />
      </div>
      <p className="mt-6 text-center text-sm text-neutral-500">در حال بارگذاری صفحهٔ سالن…</p>
    </main>
  );
}

export default function SalonPage({ slug: slugProp }: { slug?: string }) {
  const params = useParamsTyped<{ slug: string }>();
  const slug = (slugProp ?? params.slug ?? "").trim();

  if (!slug) {
    return (
      <main className="mx-auto flex min-h-[45vh] max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="text-4xl">🪞</div>
        <h1 className="text-xl font-black text-neutral-900 dark:text-neutral-100">سالن پیدا نشد</h1>
        <p className="text-sm text-neutral-500">نشانی صفحهٔ سالن کامل نیست؛ نشانی را از نو باز کنید.</p>
        <a href="/salons" className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white">
          مشاهده سالن‌ها
        </a>
      </main>
    );
  }

  return (
    <Suspense fallback={<Skeleton />}>
      <SalonExperience slug={slug} />
    </Suspense>
  );
}
