"use client";

/** دکمه تلاش مجدد در صفحه آفلاین (نیازمند رویداد کلیک) */
export default function OfflineReload() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="w-full rounded-xl bg-gradient-to-l from-pink-600 to-purple-600 py-3.5 font-bold text-white shadow-lg shadow-pink-500/25 transition hover:opacity-95"
    >
      🔄 تلاش مجدد
    </button>
  );
}
