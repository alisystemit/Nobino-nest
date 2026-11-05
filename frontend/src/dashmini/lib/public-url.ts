/**
 * نشانی عمومی سالن در داشبورد مینی‌استایل.
 *
 * بارگذاری سمت سرور (dashboard-salon) آدرس را به فرم مسیر می‌سازد
 * (`https://host/s/<slug>`)؛ اما نشانی canonical هر سالن فرم ساب‌دامین است — همان
 * چیزی که در صفحهٔ اصلی، کارت سالن‌ها و بنر نصب مینی‌اپ استفاده می‌شود
 * (`subdomainUrl` در `@/lib/subdomain`). این هلپر همان منطق را به داشبورد می‌آورد:
 *
 *  • دامنهٔ اختصاصی تأییدشده  → `https://domain.example/`
 *  • بقیه                     → `https://<slug>.<root>/` (در لوکال پورت حفظ می‌شود)
 *  • اسلاگی نداریم            → همان آدرس سرور (fallback) تا لینک نشکنند
 *
 * اگر همین حالا روی ساب‌دامین همان سالن باشیم، `subdomainUrl` ریشهٔ `/` را
 * می‌دهد تا پیشوند دوباره تکرار نشود.
 */
import { subdomainUrl } from "@/lib/subdomain";

type SalonAddressParts = {
  slug?: string | null;
  customDomain?: string | null;
  domainStatus?: string | null;
};

/** دامنهٔ اختصاصی فقط وقتی معتبر است که سرور آن را VERIFIED کرده باشد */
function verifiedDomain(salon?: SalonAddressParts | null): string {
  const raw = String(salon?.customDomain ?? "").trim();
  if (!raw || String(salon?.domainStatus ?? "").toUpperCase() !== "VERIFIED") return "";
  const host = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return host ? `https://${host}/` : "";
}

/**
 * نشانی canonical صفحهٔ عمومی سالن.
 * @param salon جسم سالنِ همان بارگذاری dashboard-salon
 * @param fallback آدرس مسیر-محور سرور، برای وقتی که slug در دسترس نیست
 */
export function salonPublicAddress(salon?: SalonAddressParts | null, fallback = ""): string {
  const custom = verifiedDomain(salon);
  if (custom) return custom;
  const slug = String(salon?.slug ?? "").trim();
  if (slug) return subdomainUrl(slug);
  return fallback;
}
