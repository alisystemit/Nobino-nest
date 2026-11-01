/**
 * لینک صفحهٔ عمومی سالن — با قابلیت نصب اپلیکیشن و رزرو آنلاین.
 * در صفحه سالن‌ها (directory) این کامپوننت با لینک دقیق سالن استفاده می‌شود.
 */
import { Link } from "@/router-shim";
import { useState } from "react";
import { Share2, Calendar, MapPin, Star } from "lucide-react";

type SalonLinkProps = {
  slug: string;
  customDomain?: string | null;
  domainStatus?: string;
  name: string;
  city?: string | null;
  className?: string;
};

export default function SalonLinkWithInstall({
  slug,
  customDomain,
  domainStatus,
  name,
  city,
  className,
}: SalonLinkProps) {
  const [showMenu, setShowMenu] = useState(false);
  
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let href = `/s/${slug}`;
  
  if (customDomain && domainStatus === "VERIFIED") {
    href = `https://${customDomain}`;
  } else if (origin && subdomainMode(origin)) {
    href = salonUrlFromOrigin(slug, origin);
  }

  function subdomainMode(origin: string): boolean {
    const host = new URL(origin).hostname;
    return host !== "localhost" && host !== "127.0.0.1" && host.split(".").length > 2;
  }

  function salonUrlFromOrigin(slug: string, origin: string): string {
    const host = new URL(origin).hostname;
    return `https://${slug}.${host}`;
  }

  function handleInstall(e: React.MouseEvent) {
    e.preventDefault();
    // ذخیره مسیر برای نصب اپلیکیشن
    localStorage.setItem("nobino.launchPath", `/s/${slug}`);
    // نمایش پیام موفقیت
    alert("لینک دقیق سالن کپی شد و قابل نصب است!");
  }

  return (
    <div className="relative group">
      <Link
        href={href}
        className={`flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-pink-500" />
          <div>
            <div className="font-bold text-neutral-900 dark:text-neutral-100">{name}</div>
            {city && <div className="text-xs text-neutral-500">{city}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleInstall}
            className="rounded-lg bg-pink-50 px-3 py-1.5 text-xs font-bold text-pink-600 transition hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-300"
          >
            📱 نصب
          </button>
          <Share2 className="h-5 w-5 text-neutral-400" />
        </div>
      </Link>
    </div>
  );
}
