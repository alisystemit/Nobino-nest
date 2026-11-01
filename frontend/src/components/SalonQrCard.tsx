/**
 * کارت کیو‌آر کد صفحهٔ عمومی سالن — مشتری با اسکن، مستقیم وارد صفحهٔ نوبت‌دهی می‌شود.
 * SVG برای نمایش روی صفحه و PNG با کیفیت بالا برای چاپ/استوری اینستاگرام تولید می‌شود.
 */
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  slug: string;
  name: string;
  customDomain?: string | null;
  domainStatus?: string | null;
  size?: number;
};

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
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const target = salonPublicUrl({ slug, customDomain, domainStatus });
    setUrl(target);
    let cancelled = false;
    Promise.all([
      QRCode.toString(target, { type: "svg", margin: 1, width: size, errorCorrectionLevel: "M" }),
      QRCode.toDataURL(target, { margin: 2, width: 640, errorCorrectionLevel: "M" }),
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
  }, [slug, name, customDomain, domainStatus, size]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard در دسترس نیست */
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-700"
        style={{ width: size + 24, height: size + 24 }}
        aria-label={`کیو‌آر کد صفحهٔ ${name}`}
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
      <div className="flex w-full gap-2">
        <a
          href={png ?? undefined}
          download={`nobino-qr-${slug}.png`}
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
          {copied ? "کپی شد ✅" : "🔗 کپی لینک"}
        </button>
      </div>
    </div>
  );
}
