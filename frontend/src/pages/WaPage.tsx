import { useEffect, useState } from "react";
import { Link } from "@/router-shim";
import WebAppScript from "@/components/WebAppScript";


const messengers = [
  { name: "تلگرام", icon: "✈️", color: "bg-sky-50 text-sky-700" },
  { name: "ایتا", icon: "💬", color: "bg-emerald-50 text-emerald-700" },
  { name: "بله", icon: "🌐", color: "bg-purple-50 text-purple-700" },
];

type WaSalon = { slug: string; name: string; city?: string | null };

export default function WaPage() {
  // U6: «سالن ماه» هاردکد بود؛ اگر آن اسلاگ وجود نداشته باشد کاربر به صفحهٔ ۴۰۴ می‌رفت
  // و راه برگشتی نداشت. حالا نمونه‌ها از خودِ سرویس خوانده می‌شوند (فقط سالن‌های تأییدشده).
  const [samples, setSamples] = useState<WaSalon[]>([]);
  const [samplesFailed, setSamplesFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/salons/search?limit=3", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: any) => {
        if (!alive) return;
        if (!d || d.success === false) throw new Error("bad payload");
        setSamples(Array.isArray(d.salons) ? d.salons : []);
      })
      .catch(() => {
        if (alive) setSamplesFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <WebAppScript />
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-100 text-3xl">🎙️</div>
        <h1 className="mt-4 text-2xl font-black text-neutral-900">نوبت‌دهی صوتی نوبینو</h1>
        <p className="mt-2 text-sm text-neutral-500">
          این وب‌اپ را می‌توانید داخل تلگرام، ایتا یا بله برای مشتریان خود باز کنید.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {messengers.map((m) => (
          <div key={m.name} className={`flex items-center gap-3 rounded-2xl ${m.color} px-4 py-3`}>
            <span className="text-2xl">{m.icon}</span>
            <div>
              <div className="font-bold">{m.name}</div>
              <div className="text-xs opacity-70">از طریق ربات/منوی پیام‌رسان باز می‌شود</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="font-extrabold text-neutral-900">سالن‌های فعال</h2>
        {samples.length > 0 ? (
          <div className="mt-4 space-y-3">
            {samples.map((s) => (
              <Link key={s.slug} href={`/wa/salon/${s.slug}`} className="block rounded-xl border border-neutral-100 px-4 py-3 transition hover:border-pink-300">
                <div className="font-bold text-neutral-800">{s.name}</div>
                <div className="text-xs text-neutral-400">{s.city ? `${s.city} — ` : ""}نوبت صوتی — گالری — خدمات</div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">
            {samplesFailed
              ? "فهرست سالن‌ها خوانده نشد؛ از دکمهٔ پایین همهٔ سالن‌ها را ببینید."
              : "هنوز سالن فعالی ثبت نشده است."}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/salons" className="rounded-xl bg-pink-600 px-4 py-2.5 text-sm font-bold text-white">
            مشاهده همهٔ سالن‌ها
          </Link>
          <Link href="/" className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-bold text-neutral-700">
            بازگشت به نوبینو
          </Link>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-neutral-400">
        برای اتصال به هر پیام‌رسان، ربات آن را به آدرس این صفحه متصل کنید.
      </p>
    </main>
  );
}
