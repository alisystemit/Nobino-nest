import { Link } from "@/router-shim";
import OfflineReload from "@/components/OfflineReload";


/** صفحه آفلاین PWA — وقتی اتصال اینترنت قطع است نمایش داده می‌شود */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100 text-4xl dark:bg-neutral-800">
          📡
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-neutral-900 dark:text-neutral-100">شما آفلاین هستید</h1>
        <p className="mt-3 leading-7 text-neutral-600 dark:text-neutral-400">
          اتصال اینترنت برقرار نیست. به محض اتصال مجدد، همین صفحه به‌صورت خودکار به‌روزرسانی می‌شود.
        </p>
        <div className="mt-6 space-y-3 rounded-2xl bg-neutral-50 p-4 text-sm dark:bg-neutral-800/60">
          <p className="text-neutral-600 dark:text-neutral-300">💡 نکته: اطلاعات رزروهای شما همیشه در سرور امن نگهداری می‌شود.</p>
        </div>
        <div className="mt-8 flex flex-col gap-2">
          <OfflineReload />
          <Link
            href="/"
            className="w-full rounded-xl bg-neutral-100 py-3.5 font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200"
          >
            بازگشت به خانه
          </Link>
        </div>
      </div>
    </main>
  );
}
