/**
 * کارت کیو‌آر کد سالن — دو هدف دارد:
 *   «صفحهٔ وب»  : آدرس عمومی سالن (دامنهٔ اختصاصی / ساب‌دامنه / مسیر /s/slug)
 *   «مینی‌اپ»   : /mini?salon=<slug> در پیام‌رسان؛ مشتری همان‌جا سالن را می‌بیند و
 *                 با اسکن، سالن به «علاقه‌مندی‌های» او هم اضافه می‌شود.
 * SVG برای نمایش روی صفحه و PNG با کیفیت بالا برای چاپ/استوری اینستاگرام تولید می‌شود.
 */
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { api } from "@/lib/api";

type Props = {
  slug: string;
  name: string;
  customDomain?: string | null;
  domainStatus?: string | null;
  size?: number;
};

type QrMode = "web" | "mini";

/** آدرس عمومی صفحهٔ سالن — دامنهٔ اختصاصی تأییدشده، حالت ساب‌دامنه (mah.localhost:5175)، یا مسیر /s/slug */
export function salonPublicUrl(props: Pick<Props, "slug" | "customDomain" | "domainStatus">): string {
  const { slug, customDomain, domainStatus } = props;
  if (typeof window === "undefined") return `/s/${slug}`;
  if (customDomain && domainStatus === "VERIFIED") return `https://${customDomain}`;
  const { protocol, hostname, port } = window.location;
  const host = port ? `${hostname}:${port}` : hostname;
  // اگر همین حالا روی ساب‌دامنهٔ سالن هستیم، همان آدرس را نگه می‌داریم (mah.mah ساخته نشود)
  if (hostname === `${slug}.localhost` || hostname.startsWith(`${slug}.`)) return `${protocol}//${host}/`;
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  // *.localhost و دامنه‌های چندتکهٔ واقعی ساب‌دامنه را resolve می‌کنند؛ برای IP فقط مسیر /s/slug کار می‌کند
  const subdomainable = !isIp && (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.includes("."));
  if (subdomainable) return `${protocol}//${slug}.${host}/`;
  return `${protocol}//${host}/s/${slug}`;
}

export default function SalonQrCard({ slug, name, customDomain, domainStatus, size = 190 }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [png, setPng] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<QrMode>("web");

  /** پایهٔ مینی‌اپ از تنظیمات سوپرادمین (تنها وقتی لازم است که قطب «مینی‌اپ» انتخاب شود) */
  const [miniBase, setMiniBase] = useState("");
  const [miniChecked, setMiniChecked] = useState(false);

  const webUrl = useMemo(() => salonPublicUrl({ slug, customDomain, domainStatus }), [slug, customDomain, domainStatus]);

  useEffect(() => {
    if (mode !== "mini" || miniChecked) return;
    let cancelled = false;
    void api<{ miniUrl?: string }>("/api/mini/config").then((res) => {
      if (cancelled) return;
      if (res.ok && res.data?.miniUrl) setMiniBase(String(res.data.miniUrl).replace(/\/+$/, ""));
      setMiniChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, miniChecked]);

  // اگر لینک مینی‌اپ آماده نبود، همان صفحهٔ وب نشان داده می‌شود (کیو‌آر هیچ‌وقت خالی نمی‌ماند)
  const url = mode === "mini" && miniBase ? `${miniBase}?salon=${encodeURIComponent(slug)}` : webUrl;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    Promise.all([
      QRCode.toString(url, { type: "svg", margin: 1, width: size, errorCorrectionLevel: "M" }),
      QRCode.toDataURL(url, { margin: 2, width: 640, errorCorrectionLevel: "M" }),
    ])
      .then(([s, p]) => {
        if (!cancelled) {
          setSvg(s);
          setPng(p);
        }
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url, size]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard در دسترس نیست */
    }
  }

  const seg = (active: boolean) =>
    `flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
      active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
    }`;

  return (
    <div className="flex flex-col items-center gap-3" id="salon-qr-card">
      <div className="flex w-full gap-1.5 rounded-xl bg-neutral-50 p-1 dark:bg-neutral-900" role="tablist" aria-label="هدف کیو‌آر">
        <button type="button" className={seg(mode === "web")} data-qr-mode="web" aria-pressed={mode === "web"} onClick={() => setMode("web")}>
          صفحهٔ وب
        </button>
        <button type="button" className={seg(mode === "mini")} data-qr-mode="mini" aria-pressed={mode === "mini"} onClick={() => setMode("mini")}>
          مینی‌اپ
        </button>
      </div>
      <div
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-700"
        style={{ width: size + 24, height: size + 24 }}
        aria-label={`کیو‌آر کد ${mode === "mini" ? "مینی‌اپ" : "صفحهٔ وب"} ${name}`}
      >
        {svg ? (
          <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-400">در حال ساخت…</div>
        )}
      </div>
      {url && (
        <div className="max-w-full truncate rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" dir="ltr" title={url}>
          {url.replace(/^https?:\/\//, "")}
        </div>
      )}
      {/* لینک علاقه‌مندی — همان کیو‌آرِ مینی‌اپ به‌صورت متن؛ برای ارسال در استوری/پیامک */}
      {mode === "mini" && miniBase ? (
        <div className="w-full rounded-xl border border-pink-200/70 bg-pink-50/60 p-2.5 text-right dark:border-neutral-700 dark:bg-neutral-800/60">
          <div className="mb-1.5 text-[11px] font-bold text-neutral-700 dark:text-neutral-200">لینک افزودن به علاقه‌مندی‌ها</div>
          <div className="flex items-center gap-1.5">
            <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-[10.5px] text-neutral-600 dark:bg-neutral-900 dark:text-neutral-300">
              {url}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="shrink-0 rounded-lg bg-pink-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-pink-700"
            >
              {copied ? "کپی شد ✅" : "کپی"}
            </button>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-4 text-neutral-500 dark:text-neutral-400">
            مشتری با لمس این لینک، مینی‌اپ را باز می‌کند و سالن به علاقه‌مندی‌هایش اضافه می‌شود.
          </p>
        </div>
      ) : null}
      <p className="text-[11px] leading-5 text-neutral-500 dark:text-neutral-400">
        {mode === "mini"
          ? miniBase
            ? "مشتری با اسکن یا لمس لینک، مینی‌اپ را در پیام‌رسان باز می‌کند و این سالن به علاقه‌مندی‌هایش اضافه می‌شود."
            : "لینک مینی‌اپ از پنل سوپرادمین تنظیم نشده است؛ فعلاً همان صفحهٔ وب اسکن می‌شود."
          : "مشتری با اسکن، مستقیم وارد صفحهٔ نوبت‌دهی سالن می‌شود."}
      </p>
      <div className="flex w-full gap-2">
        <a
          href={png ?? undefined}
          download={`nobino-qr-${slug}${mode === "mini" ? "-mini" : ""}.png`}
          aria-disabled={!png}
          className={`flex-1 rounded-xl px-3 py-2 text-center text-xs font-bold transition ${
            png
              ? "bg-pink-600 text-white hover:bg-pink-700"
              : "pointer-events-none bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
          }`}
        >
          ⬇️ دانلود PNG
        </a>
        <button
          onClick={copyLink}
          className="flex-1 rounded-xl bg-neutral-100 px-3 py-2 text-xs font-bold text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          {copied ? "کپی شد ✅" : mode === "mini" ? "🔗 کپی لینک علاقه‌مندی" : "🔗 کپی لینک"}
        </button>
      </div>
    </div>
  );
}
