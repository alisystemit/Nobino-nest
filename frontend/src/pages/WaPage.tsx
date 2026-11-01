import { Link } from "@/next";
import WebAppScript from "@/components/WebAppScript";


const messengers = [
  { name: "تلگرام", icon: "✈️", color: "bg-sky-50 text-sky-700" },
  { name: "ایتا", icon: "💬", color: "bg-emerald-50 text-emerald-700" },
  { name: "بله", icon: "🌐", color: "bg-purple-50 text-purple-700" },
];

export default function WaPage() {
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
        <h2 className="font-extrabold text-neutral-900">سالن‌های نمونه</h2>
        <div className="mt-4 space-y-3">
          <Link href="/wa/salon/mah" className="block rounded-xl border border-neutral-100 px-4 py-3 transition hover:border-pink-300">
            <div className="font-bold text-neutral-800">سالن زیبایی ماه</div>
            <div className="text-xs text-neutral-400">نوبت صوتی — گالری — خدمات</div>
          </Link>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-neutral-400">
        برای اتصال به هر پیام‌رسان، ربات آن را به آدرس این صفحه متصل کنید.
      </p>
    </main>
  );
}
