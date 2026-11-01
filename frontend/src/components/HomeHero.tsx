"use client";

import Link from "@/next";
import { useI18n } from "@/lib/i18n";
import SalonIcon from "@/components/icons/SalonIcon";

const floating = ["✂️", "🎨", "💅", "✨", "salon", "💄"];

export default function HomeHero() {
  const { t } = useI18n();
  return (
    <section className="relative overflow-hidden bg-brand-gradient text-white">
      <div className="absolute inset-0 bg-hero-pattern" />

      {/* ذرات شناور */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        {floating.map((e, i) => (
          <span
            key={i}
            className={`absolute text-3xl opacity-40 ${i % 2 ? "animate-float" : "animate-float-delay"}`}
            style={{ left: `${8 + i * 15}%`, top: `${15 + (i % 3) * 22}%` }}
          >
            {e === "salon" ? <SalonIcon className="h-8 w-8" /> : e}
          </span>
        ))}
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-28">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-sm font-semibold backdrop-blur">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          {t("hero.badge")}
        </span>

        <h1 className="mx-auto mt-8 max-w-4xl text-4xl font-black leading-tight sm:text-6xl lg:text-7xl animate-fade-up">
          {t("hero.title1")}
          <br />
          <span className="bg-gradient-to-l from-yellow-200 via-white to-pink-100 bg-clip-text text-transparent">
            {t("hero.title2")}
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-rose-50/90 animate-fade-up">
          {t("hero.subtitle")}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-up">
          <Link
            href="/salons"
            className="rounded-2xl bg-white px-8 py-4 text-base font-black text-rose-600 shadow-2xl shadow-black/10 transition hover:scale-[1.04] hover:shadow-rose-500/30"
          >
            🔍 {t("hero.search")}
          </Link>
          <Link
            href="/s/mah"
            className="rounded-2xl border border-white/40 bg-white/10 px-8 py-4 text-base font-bold text-white backdrop-blur transition hover:bg-white/20 hover:scale-[1.03]"
          >
            ✨ {t("hero.demo")}
          </Link>
        </div>

        {/* آمار */}
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-3 gap-4">
          {[
            ["+۲۰", "درگاه پرداخت"],
            ["۱۰", "سرویس پیامک"],
            ["۲۴/۷", "نوبت صوتی"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl border border-white/15 bg-white/10 px-3 py-4 backdrop-blur">
              <div className="text-2xl font-black text-white sm:text-3xl">{v}</div>
              <div className="mt-1 text-xs text-rose-100/80 sm:text-sm">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* موج پایین */}
      <svg className="block w-full text-white" viewBox="0 0 1440 60" preserveAspectRatio="none">
        <path fill="currentColor" d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z" />
      </svg>
    </section>
  );
}
