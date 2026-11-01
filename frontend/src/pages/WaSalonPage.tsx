/** صفحهٔ وب‌اپ پیام‌رسان — معادل src/app/wa/salon/[slug]/page.tsx */
import { useParamsTyped } from "@/router-shim";
import SalonBooking from "@/components/SalonBooking";
import WebAppScript from "@/components/WebAppScript";
import SalonIcon from "@/components/icons/SalonIcon";
import { usePageData } from "@/lib/page-data";
import { useMeta } from "@/lib/use-meta";

export default function WaSalonPage() {
  const { slug } = useParamsTyped<{ slug: string }>();
  const { data, loading } = usePageData<any>("wa-salon", { slug });
  useMeta(data?.found ? `${data.salon?.name ?? "سالن"} | نوبت صوتی` : undefined);

  if (loading && !data) {
    return <main className="mx-auto max-w-lg px-4 py-12 text-center text-neutral-500">در حال بارگذاری…</main>;
  }
  if (!data || !data.found) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-black text-neutral-900">سالن یافت نشد</h1>
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
