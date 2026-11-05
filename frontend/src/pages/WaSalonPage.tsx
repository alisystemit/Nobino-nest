/** صفحهٔ وب‌اپ پیام‌رسان — معادل src/app/wa/salon/[slug]/page.tsx */
import { Link, useParamsTyped } from "@/router-shim";
import SalonBooking from "@/components/SalonBooking";
import WebAppScript from "@/components/WebAppScript";
import SalonIcon from "@/components/icons/SalonIcon";
import { usePageData } from "@/lib/page-data";
import { useMeta } from "@/lib/use-meta";

export default function WaSalonPage() {
  const { slug } = useParamsTyped<{ slug: string }>();
  const { data, loading, error, reload } = usePageData<any>("wa-salon", { slug });
  useMeta(data?.found ? `${data.salon?.name ?? "سالن"} | نوبت صوتی` : undefined);

  if (loading && !data) {
    return <main className="mx-auto max-w-lg px-4 py-12 text-center text-neutral-500">در حال بارگذاری…</main>;
  }
  if (!data || !data.found) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="text-4xl">🪞</div>
        <h1 className="text-xl font-black text-neutral-900">این صفحه باز نشد</h1>
        <p className="text-sm text-neutral-500">
          {/* U6: قبلاً فقط تیتر «سالن یافت نشد» بود و کاربر داخل پیام‌رسان راه برگشتی نداشت */}
          {error
            ? "خواندن اطلاعات سالن با خطا مواجه شد."
            : `سالنی با نشانی «${slug || "—"}» پیدا نشد؛ ممکن است غیرفعال شده یا نشانی را اشتباه باز کرده باشید.`}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <button onClick={reload} className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-bold text-white">
            تلاش دوباره
          </button>
          <Link href="/wa" className="rounded-xl border border-neutral-200 px-5 py-2.5 text-sm font-bold text-neutral-700">
            سالن‌های پیام‌رسان
          </Link>
          <Link href="/salons" className="text-sm font-bold text-neutral-500 underline-offset-4 hover:underline">
            مشاهده همهٔ سالن‌ها
          </Link>
        </div>
      </main>
    );
  }

  const salon = data.salon;
  return (
    <main className="mx-auto max-w-lg px-4 py-6">
      <WebAppScript />
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">
          {salon.logoUrl ? (
            <img src={salon.logoUrl} alt="" className="h-full w-full rounded-xl object-cover" />
          ) : (
            <SalonIcon className="h-8 w-8 text-neutral-400" />
          )}
        </div>
        <div>
          <h1 className="text-lg font-black text-neutral-900">{salon.name}</h1>
          <p className="text-xs text-neutral-500">{salon.city} {salon.address}</p>
        </div>
      </div>

      <SalonBooking salonId={salon.id} slug={salon.slug} services={salon.services} staff={salon.staff} branches={salon.branches} />

      <p className="mt-6 text-center text-xs text-neutral-400">
        نوبینو — برای استفاده در تلگرام، ایتا و بله
      </p>
    </main>
  );
}
